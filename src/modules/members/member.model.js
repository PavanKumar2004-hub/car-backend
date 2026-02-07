import mongoose from "mongoose";

const memberSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    role: {
      type: String,
      enum: ["FAMILY", "FRIEND"],
      required: true,
    },

    relation: {
      type: String,
      required: true, // Father, Mother, Friend, etc.
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

export const Member = mongoose.model("Member", memberSchema);
