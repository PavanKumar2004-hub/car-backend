import { getIO } from "../../sockets/socket.js";
import { Member } from "../members/member.model.js";
import { Approval } from "./approval.model.js";
import { Request } from "./request.model.js";

const REQUEST_TTL_MS = 20 * 60 * 1000;

export const isExpired = (request, now = new Date()) => {
  if (request?.expiresAt instanceof Date) {
    return request.expiresAt <= now;
  }

  const createdAt =
    request?.createdAt instanceof Date ? request.createdAt : undefined;

  if (!createdAt) return false;

  return now.getTime() - createdAt.getTime() >= REQUEST_TTL_MS;
};

const emitToOwnerRoom = (ownerId, event, payload) => {
  try {
    const io = getIO();
    io.to(`owner:${ownerId.toString()}`).emit(event, payload);
  } catch {
    // socket not available (e.g., during boot/tests)
  }
};

export const cleanupOwnerRequests = async (ownerId) => {
  const existingRequests = await Request.find({ ownerId }).select("_id");
  const requestIds = existingRequests.map((r) => r._id);

  if (requestIds.length === 0) return;

  await Approval.deleteMany({
    requestId: { $in: requestIds },
  });

  await Request.deleteMany({
    _id: { $in: requestIds },
  });
};

export const createCarStartRequest = async ({ ownerId, vehicleId, alcoholLevel }) => {
  if (!ownerId) throw new Error("ownerId is required");
  if (!vehicleId) throw new Error("vehicleId is required");

  await cleanupOwnerRequests(ownerId);

  const members = await Member.find({
    ownerId,
    status: "ACTIVE",
    role: "FAMILY",
  });

  if (members.length === 0) {
    const err = new Error("No family members available");
    // @ts-ignore
    err.statusCode = 400;
    throw err;
  }

  const expiresAt = new Date(Date.now() + REQUEST_TTL_MS);

  const request = await Request.create({
    ownerId,
    vehicleId,
    alcoholLevel,
    status: "PENDING",
    expiresAt,
  });

  const approvals = members.map((m) => ({
    requestId: request._id,
    memberId: m._id,
    decision: "PENDING",
    expiresAt,
  }));

  await Approval.insertMany(approvals);

  emitToOwnerRoom(ownerId, "request:new", {
    requestId: request._id,
    requestedAt: request.createdAt,
    expiresAt: request.expiresAt,
    vehicleId,
  });

  return request;
};

export const findActiveRequestForOwner = async (ownerId) => {
  const now = new Date();

  const requests = await Request.find({ ownerId }).sort({ createdAt: -1 }).limit(5);
  const request = requests.find((r) => !isExpired(r, now));

  return request ?? null;
};

export const buildRequestApprovalsSnapshot = async ({ ownerId, requestId }) => {
  const request = await Request.findOne({ _id: requestId, ownerId });
  if (!request) {
    const err = new Error("Request not found");
    // @ts-ignore
    err.statusCode = 404;
    throw err;
  }

  const now = new Date();
  if (isExpired(request, now)) {
    await Approval.deleteMany({ requestId });
    await Request.deleteOne({ _id: requestId });

    const err = new Error("Request expired");
    // @ts-ignore
    err.statusCode = 410;
    throw err;
  }

  const approvals = await Approval.find({ requestId }).populate({
    path: "memberId",
    populate: {
      path: "userId",
      select: "name",
    },
  });

  const result = approvals.map((a) => ({
    memberId: a.memberId._id,
    userId: a.memberId.userId._id.toString(),
    name: a.memberId.userId.name,
    relation: a.memberId.relation,
    status: a.decision ?? "PENDING",
    decidedAt: a.decision && a.decision !== "PENDING" ? a.updatedAt : null,
  }));

  return {
    requestId: request._id,
    status: request.status,
    alcoholLevel: request.alcoholLevel,
    requestedAt: request.createdAt,
    expiresAt:
      request.expiresAt ??
      new Date(request.createdAt.getTime() + REQUEST_TTL_MS),
    approvals: result,
    vehicleId: request.vehicleId,
  };
};

export const submitDecisionForRequest = async ({
  ownerId,
  requestId,
  memberId,
  decision,
}) => {
  const normalizedDecision = String(decision || "").toUpperCase();
  if (!["APPROVED", "REJECTED"].includes(normalizedDecision)) {
    const err = new Error("Invalid decision");
    // @ts-ignore
    err.statusCode = 400;
    throw err;
  }

  const request = await Request.findOne({ _id: requestId, ownerId }).select(
    "status expiresAt createdAt"
  );

  if (!request) {
    const err = new Error("Request not found");
    // @ts-ignore
    err.statusCode = 404;
    throw err;
  }

  const expiresAt =
    request.expiresAt ?? new Date(request.createdAt.getTime() + REQUEST_TTL_MS);

  if (expiresAt <= new Date()) {
    await Approval.deleteMany({ requestId });
    await Request.deleteOne({ _id: requestId });

    const err = new Error("Request expired");
    // @ts-ignore
    err.statusCode = 410;
    throw err;
  }

  if (request.status !== "PENDING") {
    const err = new Error("Request already resolved");
    // @ts-ignore
    err.statusCode = 409;
    throw err;
  }

  if (normalizedDecision === "APPROVED") {
    const alreadyApproved = await Approval.findOne({
      requestId,
      decision: "APPROVED",
    });

    if (alreadyApproved) {
      const err = new Error("Request already approved by another member");
      // @ts-ignore
      err.statusCode = 409;
      throw err;
    }
  }

  const approval = await Approval.findOneAndUpdate(
    { requestId, memberId },
    { decision: normalizedDecision },
    { new: true }
  );

  if (!approval) {
    const err = new Error("Approval record not found");
    // @ts-ignore
    err.statusCode = 404;
    throw err;
  }

  const approvals = await Approval.find({ requestId });

  let status = "PENDING";

  if (approvals.some((a) => a.decision === "APPROVED")) {
    status = "APPROVED";
  } else if (approvals.every((a) => a.decision === "REJECTED")) {
    status = "REJECTED";
  }

  await Request.updateOne({ _id: requestId }, { $set: { status } });

  emitToOwnerRoom(ownerId, "request:update", { requestId, status });
  emitToOwnerRoom(ownerId, "request:approval:update", { requestId });

  return {
    status,
    decidedBy: memberId,
    decision: normalizedDecision,
  };
};
