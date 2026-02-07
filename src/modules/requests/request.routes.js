import express from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { resolveContextRole } from "../../middlewares/contextRole.middleware.js";
import { requireContextRole } from "../../middlewares/requireContextRole.js";
import { submitDecision } from "./decision.controller.js";
import {
  askToStartCar,
  getActiveRequest,
  getRequestApprovals,
  getRequestDetails,
} from "./request.controller.js";

const router = express.Router();

router.use(protect, resolveContextRole);

router.post("/ask", requireContextRole(["OWNER"]), askToStartCar);
router.get("/active", getActiveRequest);
router.get("/:id", getRequestDetails);
router.post("/decision", requireContextRole(["FAMILY"]), submitDecision);
router.get("/:id/approvals", getRequestApprovals);

export default router;
