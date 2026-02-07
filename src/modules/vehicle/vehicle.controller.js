import crypto from "crypto";
import { User } from "../auth/user.model.js";
import { Vehicle } from "./vehicle.model.js";
import { emitActiveVehicleUpdate, toVehicleDevice } from "./vehicle.socket.js";

/* ======================================================
   CREATE VEHICLE
====================================================== */
export const createVehicle = async (req, res) => {
  const ownerId = req.user._id;

  const vehicleId = crypto.randomUUID();
  const espKey = crypto.randomBytes(16).toString("hex");

  const vehicle = await Vehicle.create({
    vehicleId,
    espKey,
    ownerId,
    name: req.body.name || "My Car",
    plateNumber: req.body.plateNumber, // 🔥 NEW
  });

  await User.updateOne(
    { _id: ownerId },
    { $set: { activeVehicleId: vehicle._id } }
  );
  emitActiveVehicleUpdate(ownerId, vehicle);

  res.json(vehicle);
};

/* ======================================================
   LIST MY VEHICLES
====================================================== */
export const getMyVehicles = async (req, res) => {
  const vehicles = await Vehicle.find({
    ownerId: req.user._id,
  }).select("-espKey name vehicleId plateNumber"); // hide key for normal listing

  res.json(vehicles);
};

/* ======================================================
   GET SINGLE VEHICLE (SHOW KEY)
====================================================== */
export const getVehicleById = async (req, res) => {
  const vehicle = await Vehicle.findOne({
    _id: req.params.id,
    ownerId: req.user._id,
  });

  if (!vehicle) {
    return res.status(404).json({ message: "Vehicle not found" });
  }

  res.json(vehicle);
};

/* ======================================================
   DELETE VEHICLE
====================================================== */
export const deleteVehicle = async (req, res) => {
  const ownerId = req.user._id;
  const { id } = req.params;

  const vehicle = await Vehicle.findOne({
    _id: id,
    ownerId,
  });

  if (!vehicle) {
    return res.status(404).json({ message: "Vehicle not found" });
  }

  await Vehicle.deleteOne({ _id: id, ownerId });

  const owner = await User.findById(ownerId).select("activeVehicleId");

  if (owner?.activeVehicleId?.toString() === id.toString()) {
    const nextVehicle = await Vehicle.findOne({ ownerId })
      .sort({ createdAt: -1 })
      .select("name vehicleId plateNumber createdAt");

    await User.updateOne(
      { _id: ownerId },
      { $set: { activeVehicleId: nextVehicle?._id ?? null } }
    );

    emitActiveVehicleUpdate(ownerId, nextVehicle);
  }

  res.json({ message: "Vehicle deleted" });
};

/* ======================================================
   SET ACTIVE VEHICLE (OWNER)
====================================================== */
export const setActiveVehicle = async (req, res) => {
  const ownerId = req.user._id;
  const { id } = req.params;

  const vehicle = await Vehicle.findOne({
    _id: id,
    ownerId,
  }).select("name vehicleId plateNumber createdAt");

  if (!vehicle) {
    return res.status(404).json({ message: "Vehicle not found" });
  }

  await User.updateOne(
    { _id: ownerId },
    { $set: { activeVehicleId: vehicle._id } }
  );

  emitActiveVehicleUpdate(ownerId, vehicle);

  res.json({
    activeVehicle: toVehicleDevice(vehicle),
  });
};

/* ======================================================
   ROTATE ESP KEY (SECURITY)
====================================================== */
export const rotateEspKey = async (req, res) => {
  const newKey = crypto.randomBytes(16).toString("hex");

  const vehicle = await Vehicle.findOneAndUpdate(
    {
      _id: req.params.id,
      ownerId: req.user._id,
    },
    { espKey: newKey },
    { new: true }
  );

  if (!vehicle) {
    return res.status(404).json({ message: "Vehicle not found" });
  }

  res.json({
    vehicleId: vehicle.vehicleId,
    espKey: newKey,
  });
};
