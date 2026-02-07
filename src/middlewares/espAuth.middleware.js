import { Vehicle } from "../modules/vehicle/vehicle.model.js";

export const espProtect = async (req, res, next) => {
  const vehicleId = req.headers["x-vehicle-id"];
  const key = req.headers["x-esp-key"];

  if (!vehicleId || !key) {
    return res.status(401).json({ message: "Missing headers" });
  }

  const vehicle = await Vehicle.findOne({
    vehicleId,
    espKey: key,
  });

  if (!vehicle) {
    return res.status(401).json({ message: "Invalid vehicle" });
  }

  /* 🔥 dynamic owner resolution */
  req.ownerId = vehicle.ownerId;
  req.vehicleId = vehicleId;

  next();
};
