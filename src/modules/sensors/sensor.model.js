import mongoose from "mongoose";

const sensorSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // stable UUID from Vehicle.vehicleId (not Mongo _id)
    vehicleId: {
      type: String,
      required: true,
      index: true,
    },

    alcohol: Number,

    ultrasonic: {
      front: Number,
      back: Number,
    },

    surface: {
      left: Number,
      right: Number,
    },

    accel: {
      x: Number,
      y: Number,
      z: Number,
    },

    speed: Number,

    location: {
      lat: Number,
      lng: Number,
    },
  },
  { timestamps: true }
);

export const Sensor = mongoose.model("Sensor", sensorSchema);
