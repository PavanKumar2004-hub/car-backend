import { Member } from "../members/member.model.js";

/* ======================================================
   SEND FAMILY CONTACTS TO ESP32
====================================================== */
export const getFamilyContactsForVehicle = async (req, res) => {
  const ownerId = req.user._id; // dashboard owner / vehicle owner

  const members = await Member.find({
    ownerId,
    role: "FAMILY",
    status: "ACTIVE",
  }).populate("userId", "name phone");

  const contacts = members.map((m) => ({
    name: m.userId.name,
    phone: m.userId.phone,
    relation: m.relation,
  }));

  res.json({
    contacts,
  });
};
