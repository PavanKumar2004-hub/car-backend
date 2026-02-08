import express from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  registerDeviceToken,
  unregisterDeviceToken,
} from "./notifications.controller.js";

const router = express.Router();

router.use(protect);

router.post("/device-token", registerDeviceToken);
router.delete("/device-token", unregisterDeviceToken);

export default router;

