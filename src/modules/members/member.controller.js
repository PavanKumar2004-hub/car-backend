import { User } from "../auth/user.model.js";
import { Member } from "./member.model.js";
import { publishVehicleCommandToOwnerVehicles } from "../../services/mqtt/mqtt.publisher.js";

/**
 * ADD MEMBER
 */
export const addMember = async (req, res) => {
  const { phone, relation, role } = req.body;

  const user = await User.findOne({ phone });

  if (!user) {
    return res.status(400).json({
      message: "User must register first before being added as a member",
    });
  }

  if (user._id.equals(req.user._id)) {
    return res.status(400).json({
      message: "You cannot add yourself as a member",
    });
  }

  const ownerId =
    req.contextRole === "OWNER" ? req.user._id : req.dashboardOwnerId;

  const exists = await Member.findOne({
    ownerId,
    userId: user._id,
  });

  if (exists) {
    return res.status(400).json({
      message: "Member already added",
    });
  }

  const member = await Member.create({
    ownerId,
    userId: user._id,
    relation,
    role,
  });

  const populatedMember = await Member.findById(member._id).populate(
    "userId",
    "name phone email"
  );

  try {
    await publishVehicleCommandToOwnerVehicles(ownerId, { isContactUpdate: true });
  } catch {
    // ignore MQTT publish failures
  }

  res.status(201).json(populatedMember);
};

/**
 * GET MEMBERS
 * 🔥 EXCLUDE CURRENT USER (self)
 */
export const getMembers = async (req, res) => {
  const ownerId =
    req.contextRole === "OWNER" ? req.user._id : req.dashboardOwnerId;

  const members = await Member.find({
    ownerId,
    status: "ACTIVE",
    userId: { $ne: req.user._id }, // 🔥 hide self
  })
    .populate("userId", "name phone email")
    .sort({ createdAt: -1 });

  res.json(members);
};

/**
 * UPDATE MEMBER
 */
export const updateMember = async (req, res) => {
  const { id } = req.params;
  const { relation, role, status } = req.body;

  const ownerId =
    req.contextRole === "OWNER" ? req.user._id : req.dashboardOwnerId;

  const member = await Member.findOne({
    _id: id,
    ownerId,
  });

  if (!member) {
    return res.status(404).json({
      message: "Member not found or access denied",
    });
  }

  if (req.contextRole === "FRIEND") {
    return res.status(403).json({
      message: "Access denied",
    });
  }

  if (req.contextRole === "OWNER" && member.role === "FAMILY") {
    return res.status(403).json({
      message: "Approval required to update family member",
    });
  }

  member.relation = relation ?? member.relation;
  member.role = role ?? member.role;
  member.status = status ?? member.status;

  await member.save();

  try {
    await publishVehicleCommandToOwnerVehicles(ownerId, { isContactUpdate: true });
  } catch {
    // ignore MQTT publish failures
  }

  res.json(member);
};

/**
 * DELETE MEMBER
 * 🔥 MUST USE ownerId FILTER (SECURITY)
 */
export const deleteMember = async (req, res) => {
  const { id } = req.params;

  const ownerId =
    req.contextRole === "OWNER" ? req.user._id : req.dashboardOwnerId;

  const member = await Member.findOne({
    _id: id,
    ownerId,
  });

  if (!member) {
    return res.status(404).json({ message: "Member not found" });
  }

  if (req.contextRole === "FRIEND") {
    return res.status(403).json({
      message: "Access denied",
    });
  }

  if (req.contextRole === "OWNER" && member.role === "FAMILY") {
    return res.status(403).json({
      message: "Approval required to delete family member",
    });
  }

  await Member.deleteOne({ _id: id });

  try {
    await publishVehicleCommandToOwnerVehicles(ownerId, { isContactUpdate: true });
  } catch {
    // ignore MQTT publish failures
  }

  res.json({ message: "Member removed successfully" });
};
