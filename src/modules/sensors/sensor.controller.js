import { getIO } from "../../sockets/socket.js";
import { Sensor } from "./sensor.model.js";

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

  return snapshot;
};

export const updateSensors = async (req, res) => {
  return res.status(410).json({
    message: "Sensor HTTP ingestion disabled. Use MQTT.",
  });
};
