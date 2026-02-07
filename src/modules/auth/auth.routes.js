import express from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { resolveContextRole } from "../../middlewares/contextRole.middleware.js";
import { Vehicle } from "../vehicle/vehicle.model.js";
import { login, register } from "./auth.controller.js";
import { User } from "./user.model.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

router.get("/me", protect, (req, res) => {
  res.json({
    _id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
  });
});

router.get("/context", protect, resolveContextRole, async (req, res) => {
  const ownerId = req.dashboardOwnerId || req.user._id;

  // 🔥 fetch owner info
  const owner = await User.findById(ownerId).select(
    "name phone email activeVehicleId"
  );

  if (!owner) {
    return res.status(404).json({ message: "Owner not found" });
  }

  // 🔥 resolve active vehicle (single source of truth)
  let activeVehicle = null;

  if (owner.activeVehicleId) {
    activeVehicle = await Vehicle.findOne({
      _id: owner.activeVehicleId,
      ownerId,
    }).select("name vehicleId plateNumber createdAt");
  }

  // fallback: pick latest vehicle if active is missing/not set
  if (!activeVehicle) {
    activeVehicle = await Vehicle.findOne({ ownerId })
      .sort({ createdAt: -1 })
      .select("name vehicleId plateNumber createdAt");

    if (activeVehicle) {
      await User.updateOne(
        { _id: ownerId },
        { $set: { activeVehicleId: activeVehicle._id } }
      );
    }
  }

  // 🔥 fetch vehicles
  let vehicles = [];

  if (req.contextRole === "OWNER") {
    vehicles = await Vehicle.find({ ownerId })
      .sort({ createdAt: -1 })
      .select("name vehicleId plateNumber createdAt");
  } else {
    vehicles = activeVehicle ? [activeVehicle] : [];
  }

  res.json({
    contextRole: req.contextRole,
    dashboardOwnerId: ownerId,
    owner: {
      _id: owner._id,
      name: owner.name,
      phone: owner.phone,
      email: owner.email,
    },
    activeVehicle,
    vehicles,
  });
});

export default router;
