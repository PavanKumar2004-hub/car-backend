import { User } from "../../modules/auth/user.model.js";
import { Vehicle } from "../../modules/vehicle/vehicle.model.js";
import { mqttClient } from "./mqtt.client.js";

const topicForEspKey = (espKey) => `vehicle/${espKey}/commands`;

const publishJson = (topic, payload, options = {}) => {
  return new Promise((resolve, reject) => {
    const msg = JSON.stringify(payload);

    mqttClient.publish(
      topic,
      msg,
      {
        qos: options.qos ?? 1,
        retain: options.retain ?? false,
      },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
};

export const publishVehicleCommand = async (espKey, command, options = {}) => {
  if (!espKey) throw new Error("espKey is required");
  return publishJson(topicForEspKey(espKey), command, options);
};

export const publishVehicleCommandByVehicleId = async (
  ownerId,
  vehicleId,
  command,
  options = {}
) => {
  const vehicle = await Vehicle.findOne({ ownerId, vehicleId }).select("espKey");
  if (!vehicle) throw new Error("Vehicle not found for command publish");
  return publishVehicleCommand(vehicle.espKey, command, options);
};

export const publishVehicleCommandToOwnerVehicles = async (
  ownerId,
  command,
  options = {}
) => {
  const vehicles = await Vehicle.find({ ownerId }).select("espKey");
  await Promise.allSettled(
    vehicles.map((v) => publishVehicleCommand(v.espKey, command, options))
  );
};

export const publishVehicleCommandToActiveVehicle = async (
  ownerId,
  command,
  options = {}
) => {
  const owner = await User.findById(ownerId).select("activeVehicleId");
  if (!owner?.activeVehicleId) throw new Error("No active vehicle for owner");

  const vehicle = await Vehicle.findOne({
    _id: owner.activeVehicleId,
    ownerId,
  }).select("espKey vehicleId");

  if (!vehicle) throw new Error("Active vehicle not found");

  return publishVehicleCommand(vehicle.espKey, command, options);
};

