import { Member } from "../modules/members/member.model.js";

/**
 * Resolves dashboard context
 *
 * OWNER  -> dashboardOwnerId = self
 * FAMILY -> dashboardOwnerId = member.ownerId
 * FRIEND -> dashboardOwnerId = member.ownerId
 */
export const resolveContextRole = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    const member = await Member.findOne({
      userId: currentUserId,
      status: "ACTIVE", // 🔥 important
    });

    if (!member) {
      // OWNER
      req.contextRole = "OWNER";
      req.dashboardOwnerId = currentUserId; // 🔥 ALWAYS SET
    } else {
      // FAMILY or FRIEND
      req.contextRole = member.role;
      req.dashboardOwnerId = member.ownerId;
    }

    next();
  } catch (err) {
    return res.status(500).json({
      message: "Failed to resolve context role",
    });
  }
};
