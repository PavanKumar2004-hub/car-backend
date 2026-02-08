import cors from "cors";
import express from "express";

import authRoutes from "./modules/auth/auth.routes.js";
import espRoutes from "./modules/esp/esp.routes.js";
import memberRoutes from "./modules/members/member.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import requestRoutes from "./modules/requests/request.routes.js";
import sensorRoutes from "./modules/sensors/sensor.routes.js";
import vehicleRoutes from "./modules/vehicle/vehicle.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Backend running" });
});

/* ✅ ONLY KEEP THESE */
app.use("/api/sensors", sensorRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/esp", espRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/notifications", notificationsRoutes);

export default app;
