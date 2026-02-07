import express from "express";
import {
  addMember,
  deleteMember,
  getMembers,
  updateMember,
} from "./member.controller.js";

import { protect } from "../../middlewares/auth.middleware.js";
import { resolveContextRole } from "../../middlewares/contextRole.middleware.js";

const router = express.Router();

/* 🔐 Auth + context role for ALL member routes */
router.use(protect, resolveContextRole);

router.post("/", addMember);
router.get("/", getMembers);
router.put("/:id", updateMember);
router.delete("/:id", deleteMember);

export default router;
