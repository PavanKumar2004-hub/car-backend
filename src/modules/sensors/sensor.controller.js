import { getIO } from "../../sockets/socket.js";
import { Member } from "../members/member.model.js";
import { sendPushToUserIds } from "../../services/push/push.service.js";
import { Sensor } from "./sensor.model.js";

const ACCIDENT_ACCEL_THRESHOLD = 14;
const ALCOHOL_WARN_THRESHOLD = 30;
const ALCOHOL_HIGH_THRESHOLD = 70;

const PUSH_COOLDOWN_MS = {
  ACCIDENT: 90 * 1000,
  ALCOHOL_WARN: 3 * 60 * 1000,
  ALCOHOL_HIGH: 2 * 60 * 1000,
};

const lastPushByKey = new Map();

const toAlcoholPercent = (value) => {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num <= 1 ? Math.round(num * 100) : Math.round(num);
};

const accelMagnitude = (accel) => {
  if (
    typeof accel?.x !== "number" ||
    typeof accel?.y !== "number" ||
    typeof accel?.z !== "number"
  ) {
    return null;
  }

  return Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
};

const notificationKey = ({ ownerId, vehicleId, type }) =>
  `${ownerId}:${vehicleId}:${type}`;

const canSendNotification = ({ ownerId, vehicleId, type }) => {
  const cooldown = PUSH_COOLDOWN_MS[type] ?? 120 * 1000;
  const key = notificationKey({ ownerId, vehicleId, type });
  const now = Date.now();
  const previous = lastPushByKey.get(key) ?? 0;

  if (now - previous < cooldown) {
    return false;
  }

  lastPushByKey.set(key, now);

  if (lastPushByKey.size > 2000) {
    const staleBefore = now - 60 * 60 * 1000;
    for (const [entryKey, timestamp] of lastPushByKey.entries()) {
      if (timestamp < staleBefore) {
        lastPushByKey.delete(entryKey);
      }
    }
  }

  return true;
};

const resolveAlertUserIds = async (ownerId) => {
  const members = await Member.find({
    ownerId,
    status: "ACTIVE",
  }).select("userId");

  return [
    ...new Set([
      ownerId.toString(),
      ...members.map((member) => member.userId?.toString()).filter(Boolean),
    ]),
  ];
};

const dispatchSensorPushAlerts = async (snapshot) => {
  const ownerId = snapshot?.ownerId?.toString?.();
  const vehicleId = snapshot?.vehicleId;

  if (!ownerId || !vehicleId) {
    return;
  }

  const alerts = [];

  const alcoholPercent = toAlcoholPercent(snapshot?.alcohol);
  if (
    alcoholPercent != null &&
    alcoholPercent > ALCOHOL_HIGH_THRESHOLD &&
    canSendNotification({ ownerId, vehicleId, type: "ALCOHOL_HIGH" })
  ) {
    alerts.push({
      type: "ALCOHOL_HIGH",
      title: "Alcohol danger alert",
      body: `High alcohol level (${alcoholPercent}%) detected for vehicle ${vehicleId}.`,
      data: { vehicleId, alcoholLevel: alcoholPercent },
    });
  } else if (
    alcoholPercent != null &&
    alcoholPercent > ALCOHOL_WARN_THRESHOLD &&
    canSendNotification({ ownerId, vehicleId, type: "ALCOHOL_WARN" })
  ) {
    alerts.push({
      type: "ALCOHOL_WARN",
      title: "Alcohol warning",
      body: `Alcohol warning (${alcoholPercent}%) detected for vehicle ${vehicleId}.`,
      data: { vehicleId, alcoholLevel: alcoholPercent },
    });
  }

  const magnitude = accelMagnitude(snapshot?.accel);
  if (
    magnitude != null &&
    magnitude > ACCIDENT_ACCEL_THRESHOLD &&
    canSendNotification({ ownerId, vehicleId, type: "ACCIDENT" })
  ) {
    alerts.push({
      type: "ACCIDENT",
      title: "Accident alert",
      body: `Potential accident detected for vehicle ${vehicleId}. Open dashboard immediately.`,
      data: {
        vehicleId,
        accelMagnitude: magnitude.toFixed(2),
      },
    });
  }

  if (!alerts.length) {
    return;
  }

  const userIds = await resolveAlertUserIds(ownerId);
  if (!userIds.length) {
    return;
  }

  await Promise.allSettled(
    alerts.map((alert) =>
      sendPushToUserIds({
        userIds,
        type: alert.type,
        title: alert.title,
        body: alert.body,
        data: alert.data,
      })
    )
  );
};

/*
   PURE TELEMETRY INGESTION
   No rules
   No status
   No vehicle logic
*/
export const processSensorPayload = async ({ ownerId, vehicleId, data }) => {
  if (!ownerId || !vehicleId) {
    throw new Error("ownerId and vehicleId are required for telemetry storage");
  }

  // maintain single latest snapshot per vehicle
  const snapshot = await Sensor.findOneAndUpdate(
    { vehicleId },
    { $set: { ...data, ownerId, vehicleId } },
    {
      upsert: true,
      new: true,
    }
  );

  try {
    const io = getIO();
    io.to(`owner:${ownerId.toString()}`).emit("sensor:update", snapshot);
  } catch {
    // socket not available (e.g., during boot/tests)
  }

  void dispatchSensorPushAlerts(snapshot).catch(() => {
    // ignore push failures during ingestion
  });

  return snapshot;
};

export const updateSensors = async (req, res) => {
  return res.status(410).json({
    message: "Sensor HTTP ingestion disabled. Use MQTT.",
  });
};
