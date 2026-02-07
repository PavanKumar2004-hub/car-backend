import mongoose from "mongoose";

const APPROVAL_TTL_MS = 20 * 60 * 1000;

const approvalSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      required: true,
    },

    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },

    decision: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + APPROVAL_TTL_MS),
      expires: 0,
    },
  },
  { timestamps: true }
);

export const Approval = mongoose.model("Approval", approvalSchema);
