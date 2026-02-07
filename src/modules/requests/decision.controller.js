import { Member } from "../members/member.model.js";
import { publishVehicleCommandByVehicleId } from "../../services/mqtt/mqtt.publisher.js";
import { Request } from "./request.model.js";
import { submitDecisionForRequest } from "./request.service.js";

/*
   PURE APPROVAL LOGIC
   No vehicle control
   No sensor logic
*/

export const submitDecision = async (req, res) => {
  const { requestId, memberId, decision } = req.body;
  const ownerId = req.dashboardOwnerId ?? req.user._id;

  const member = await Member.findOne({
    _id: memberId,
    ownerId,
    userId: req.user._id,
    status: "ACTIVE",
  }).select("_id role");

  if (!member) {
    return res.status(403).json({ message: "Not allowed" });
  }

  if (member.role !== "FAMILY") {
    return res.status(403).json({ message: "Only family can approve/reject" });
  }

  try {
    const result = await submitDecisionForRequest({
      ownerId,
      requestId,
      memberId,
      decision,
    });

    if (result.status !== "PENDING") {
      try {
        const request = await Request.findOne({ _id: requestId, ownerId }).select(
          "vehicleId"
        );

        if (request?.vehicleId) {
          const vehicleState =
            result.status === "APPROVED"
              ? { speedAllowed: 40, lockState: "LIMITED", reason: "APPROVED" }
              : { speedAllowed: 0, lockState: "LOCKED", reason: "REJECTED" };

          await publishVehicleCommandByVehicleId(ownerId, request.vehicleId, {
            statusApproval: {
              status: result.status,
              whoApprove: {
                memberId,
                name: req.user.name,
                phone: req.user.phone,
              },
            },
            isVehicleStateUpdate: true,
            vehicleState,
          });
        }
      } catch {
        // ignore MQTT publish failures
      }
    }

    res.json(result);
  } catch (err) {
    const status = err?.statusCode ?? 500;
    res.status(status).json({ message: err?.message ?? "Failed" });
  }
};
