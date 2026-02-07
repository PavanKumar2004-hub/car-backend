import express from "express";

const router = express.Router();

// router.post("/update", updateSensors);
router.post("/update", (req, res) => {
  return res.status(410).json({
    message: "Sensor HTTP ingestion disabled. Use MQTT.",
  });
});

export default router;
