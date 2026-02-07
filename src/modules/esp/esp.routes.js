import express from "express";
import { espProtect } from "../../middlewares/espAuth.middleware.js";
import { getEspContacts } from "./espContacts.controller.js";

const router = express.Router();

/* ======================================================
   ESP ROUTES
====================================================== */

/**
 * @route   GET /api/esp/contacts
 * @desc    Get family contacts for ESP32 (RX)
 * @access  Protected (ESP / Owner token)
 */
router.get("/contacts", espProtect, getEspContacts);

export default router;
