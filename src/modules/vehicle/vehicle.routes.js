import express from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { resolveContextRole } from "../../middlewares/contextRole.middleware.js";
import { requireContextRole } from "../../middlewares/requireContextRole.js";

import {
  createVehicle,
  deleteVehicle,
  getMyVehicles,
  getVehicleById,
  rotateEspKey,
  setActiveVehicle,
} from "./vehicle.controller.js";

const router = express.Router();

/* CRUD */
router.post("/", protect, createVehicle);
router.get("/", protect, getMyVehicles);
router.get("/:id", protect, getVehicleById);
router.delete("/:id", protect, deleteVehicle);
router.put("/:id/rotate-key", protect, rotateEspKey);
router.put(
  "/:id/active",
  protect,
  resolveContextRole,
  requireContextRole(["OWNER"]),
  setActiveVehicle
);

export default router;
