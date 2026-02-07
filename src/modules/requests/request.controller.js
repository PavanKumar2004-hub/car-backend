import { Approval } from "./approval.model.js";
import { Request } from "./request.model.js";
import { User } from "../auth/user.model.js";
import { Vehicle } from "../vehicle/vehicle.model.js";
import {
  buildRequestApprovalsSnapshot,
  createCarStartRequest,
  findActiveRequestForOwner,
} from "./request.service.js";
import { publishVehicleCommandByVehicleId } from "../../services/mqtt/mqtt.publisher.js";

const resolveActiveVehicleForOwner = async (ownerId) => {
  const owner = await User.findById(ownerId).select("activeVehicleId");
  if (!owner) return null;

  if (owner.activeVehicleId) {
    const active = await Vehicle.findOne({
      _id: owner.activeVehicleId,
      ownerId,
    }).select("vehicleId");

    if (active) return active;
  }

  const fallback = await Vehicle.findOne({ ownerId })
    .sort({ createdAt: -1 })
    .select("vehicleId");

  if (fallback) {
    await User.updateOne(
      { _id: ownerId },
      { $set: { activeVehicleId: fallback._id } }
    );
  }

  return fallback ?? null;
};

/* ======================================================
   ASK TO START CAR
   RULE: ONLY ONE REQUEST EXISTS AT A TIME
   CLEANUP HAPPENS ONLY HERE
====================================================== */
export const askToStartCar = async (req, res) => {
  const { alcoholLevel } = req.body;
  const ownerId = req.dashboardOwnerId ?? req.user._id;

  // Guard: no request if alcohol is safe
  if (alcoholLevel <= 30) {
    return res.status(400).json({
      message: "Alcohol level safe. Request not required.",
    });
  }

  const activeVehicle = await resolveActiveVehicleForOwner(ownerId);
  if (!activeVehicle) {
    return res.status(400).json({
      message: "No active vehicle found for this owner",
    });
  }

  const request = await createCarStartRequest({
    ownerId,
    vehicleId: activeVehicle.vehicleId,
    alcoholLevel,
  });

  try {
    await publishVehicleCommandByVehicleId(ownerId, request.vehicleId, {
      isRequest: true,
      requestId: request._id.toString(),
      alcoholLevel: request.alcoholLevel,
      expiresAt: request.expiresAt,
      status: request.status,
    });
  } catch {
    // ignore MQTT publish failures
  }

  res.status(201).json({
    message: "Request sent to family members",
    requestId: request._id,
    requestedAt: request.createdAt,
    expiresAt: request.expiresAt,
    vehicleId: request.vehicleId,
  });
};

/* ======================================================
   GET REQUEST DETAILS (OPTIONAL)
====================================================== */
export const getRequestDetails = async (req, res) => {
  const { id } = req.params;
  const ownerId = req.dashboardOwnerId ?? req.user._id;

  const request = await Request.findOne({ _id: id, ownerId }).select("_id");
  if (!request) {
    return res.status(404).json({ message: "Request not found" });
  }

  const approvals = await Approval.find({ requestId: id }).populate({
    path: "memberId",
    select: "relation",
    populate: { path: "userId", select: "name" },
  });

  res.json(approvals);
};

/* ======================================================
   GET REQUEST APPROVALS (MAIN FRONTEND API)
====================================================== */
/* ======================================================
   GET REQUEST APPROVALS (MAIN FRONTEND API)
   RETURNS SNAPSHOT + APPROVALS
====================================================== */
export const getRequestApprovals = async (req, res) => {
  const { id } = req.params;
  const ownerId = req.dashboardOwnerId ?? req.user._id;

  try {
    const snapshot = await buildRequestApprovalsSnapshot({
      ownerId,
      requestId: id,
    });

    res.json(snapshot);
  } catch (err) {
    const status = err?.statusCode ?? 500;
    res.status(status).json({ message: err?.message ?? "Failed" });
  }
};

export const getActiveRequest = async (req, res) => {
  const ownerId = req.dashboardOwnerId ?? req.user._id;
  const request = await findActiveRequestForOwner(ownerId);

  if (!request) return res.json(null);

  res.json({
    requestId: request._id,
    status: request.status,
    vehicleId: request.vehicleId,
  });
};
