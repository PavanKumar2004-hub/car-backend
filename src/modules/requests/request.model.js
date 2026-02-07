import mongoose from "mongoose";

const REQUEST_TTL_MS = 20 * 60 * 1000;

const requestSchema = new mongoose.Schema(
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

    alcoholLevel: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + REQUEST_TTL_MS),
      expires: 0,
    },
  },
  { timestamps: true }
);

export const Request = mongoose.model("Request", requestSchema);
