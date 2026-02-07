import mqtt from "mqtt";
import { processSensorPayload } from "../../modules/sensors/sensor.controller.js";
import { Sensor } from "../../modules/sensors/sensor.model.js";
import { User } from "../../modules/auth/user.model.js";
import { Member } from "../../modules/members/member.model.js";
import {
  createCarStartRequest,
  findActiveRequestForOwner,
  submitDecisionForRequest,
} from "../../modules/requests/request.service.js";
import { Vehicle } from "../../modules/vehicle/vehicle.model.js";
import { emitActiveVehicleUpdate } from "../../modules/vehicle/vehicle.socket.js";
import { getIO } from "../../sockets/socket.js";

/* ================= EMQX CLOUD CONFIG ================= */

const MQTT_BROKER_URL = "mqtts://j0014f06.ala.asia-southeast1.emqxsl.com:8883";

const MQTT_TELEMETRY_TOPIC = "vehicle/+/telemetry";
const MQTT_EVENTS_TOPIC = "vehicle/+/events";
const MQTT_EVENT_TOPIC = "vehicle/+/event";
const MQTT_ACTIVE_TOPIC = "vehicle/active";
const MQTT_ACTIVATE_TOPIC = "vehicle/activate";

const parseVehicleTopic = (topic) => {
  const parts = topic.split("/");
  if (parts.length !== 3) return null;

  const [root, key, type] = parts;
  if (root !== "vehicle") return null;

  return { key, type };
};

const toAlcoholPercent = (value) => {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 1) return Math.round(num * 100);
  return Math.round(num);
};

const resolveVehicle = async (key) => {
  return Vehicle.findOne({
    $or: [{ espKey: key }, { vehicleId: key }],
  }).select("ownerId vehicleId name plateNumber createdAt");
};

const resolveMemberFromWho = async (ownerId, whoApprove) => {
  if (!whoApprove) return null;

  const who = String(whoApprove).trim();
  if (!who) return null;

  const members = await Member.find({
    ownerId,
    status: "ACTIVE",
    role: "FAMILY",
  }).populate("userId", "name phone");

  const phoneDigits = who.replace(/\D/g, "");

  const match =
    members.find(
      (m) => m.userId?.phone === who || m.userId?.phone === phoneDigits
    ) ??
    members.find(
      (m) =>
        m.userId?.phone?.endsWith(phoneDigits) && phoneDigits.length >= 6
    ) ??
    members.find((m) => m.relation?.toLowerCase() === who.toLowerCase()) ??
    members.find((m) => m.userId?.name?.toLowerCase() === who.toLowerCase());

  return match ?? null;
};

/* ================= CONNECT OPTIONS ================= */

export const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
  username: "pavan",
  password: "pavankumar2004",

  reconnectPeriod: 3000,
  clean: true,

  // TLS fix for some environments
  rejectUnauthorized: false,
});

/* ================= CONNECTION EVENTS ================= */

mqttClient.on("connect", () => {
  console.log("✅ EMQX MQTT connected");

  mqttClient.subscribe(
    {
      [MQTT_TELEMETRY_TOPIC]: { qos: 0 },
      [MQTT_EVENTS_TOPIC]: { qos: 0 },
      [MQTT_EVENT_TOPIC]: { qos: 0 },
      [MQTT_ACTIVE_TOPIC]: { qos: 1 },
      [MQTT_ACTIVATE_TOPIC]: { qos: 1 },
    },
    (err) => {
      if (err) {
        console.error("❌ Subscribe error:", err);
      } else {
        console.log("📡 Subscribed to:", [
          MQTT_TELEMETRY_TOPIC,
          MQTT_EVENTS_TOPIC,
          MQTT_EVENT_TOPIC,
          MQTT_ACTIVE_TOPIC,
          MQTT_ACTIVATE_TOPIC,
        ]);
      }
    }
  );
});

/* ================= MESSAGE HANDLER ================= */

mqttClient.on("message", async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());

    console.log("📥 MQTT Message:", topic);

    // Model B: device -> backend active vehicle switch (QoS 1)
    if (topic === MQTT_ACTIVE_TOPIC || topic === MQTT_ACTIVATE_TOPIC) {
      const key =
        payload?.espKey ?? payload?.vehicleId ?? payload?.key ?? payload?.espkey;

      if (!key) {
        console.warn("⚠️ Active vehicle ignored (missing espKey)");
        return;
      }

      const vehicle = await Vehicle.findOne({
        $or: [{ espKey: key }, { vehicleId: key }],
      }).select("ownerId name vehicleId plateNumber createdAt");

      if (!vehicle) {
        console.warn("⚠️ Active vehicle ignored (unknown key)");
        return;
      }

      await User.updateOne(
        { _id: vehicle.ownerId },
        { $set: { activeVehicleId: vehicle._id } }
      );

      emitActiveVehicleUpdate(vehicle.ownerId, vehicle);
      return;
    }

    const parsed = parseVehicleTopic(topic);

    if (!parsed) return;

    if (parsed.type === "telemetry") {
      const vehicle = await resolveVehicle(parsed.key);

      if (!vehicle) {
        console.warn("⚠️ Telemetry ignored (unknown vehicle key):", parsed.key);
        return;
      }

      await processSensorPayload({
        ownerId: vehicle.ownerId,
        vehicleId: vehicle.vehicleId,
        data: payload,
      });

      return;
    }

    // Model C: device -> backend trigger events
    if (parsed.type === "events" || parsed.type === "event") {
      const vehicle = await resolveVehicle(parsed.key);
      if (!vehicle) {
        console.warn("⚠️ Event ignored (unknown vehicle key):", parsed.key);
        return;
      }

      const ownerId = vehicle.ownerId;
      const vehicleId = vehicle.vehicleId;

      if (payload?.messageSent != null) {
        try {
          const io = getIO();
          io.to(`owner:${ownerId.toString()}`).emit("esp:messageSent", {
            vehicleId,
            messageSent: payload.messageSent,
          });
        } catch {
          // ignore
        }
      }

      // accident location update
      if (
        payload?.accidentLocation?.lat != null &&
        payload?.accidentLocation?.lng != null
      ) {
        await processSensorPayload({
          ownerId,
          vehicleId,
          data: { location: payload.accidentLocation },
        });
      }

      // create start request (device-triggered)
      if (payload?.isRequest) {
        const last = await Sensor.findOne({ ownerId, vehicleId }).select(
          "alcohol"
        );
        const alcoholPercent =
          toAlcoholPercent(payload?.alcoholLevel ?? payload?.alcohol) ??
          toAlcoholPercent(last?.alcohol ?? null);

        if (alcoholPercent != null && alcoholPercent > 30) {
          await createCarStartRequest({
            ownerId,
            vehicleId,
            alcoholLevel: alcoholPercent,
          });
        }
      }

      // offline approval sync (optional)
      if (payload?.statusApproval?.status) {
        const active = await findActiveRequestForOwner(ownerId);
        if (!active || active.vehicleId !== vehicleId) return;

        const status = String(payload.statusApproval.status).toUpperCase();
        if (status !== "APPROVED" && status !== "REJECTED") return;

        const who =
          payload.statusApproval.whoApprove ??
          payload.statusApproval.who ??
          payload.statusApproval.by;

        const member =
          payload.statusApproval.memberId
            ? await Member.findOne({
                _id: payload.statusApproval.memberId,
                ownerId,
                status: "ACTIVE",
                role: "FAMILY",
              })
            : await resolveMemberFromWho(ownerId, who);

        if (!member) {
          console.warn("⚠️ statusApproval ignored (member not resolved)");
          return;
        }

        await submitDecisionForRequest({
          ownerId,
          requestId: active._id,
          memberId: member._id,
          decision: status,
        });
      }

      return;
    }
  } catch (err) {
    console.error("❌ MQTT payload error:", err.message);
  }
});

/* ================= DEBUG EVENTS ================= */

mqttClient.on("error", (err) => {
  console.error("❌ MQTT connection error:", err.message);
});

mqttClient.on("close", () => {
  console.warn("⚠️ MQTT connection closed");
});

mqttClient.on("reconnect", () => {
  console.log("🔄 MQTT reconnecting...");
});
