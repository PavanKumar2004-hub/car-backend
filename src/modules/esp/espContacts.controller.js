import { Member } from "../members/member.model.js";

/* ======================================================
   ESP: GET CONTACTS (FAMILY + FRIEND)
   PURPOSE:
   - SIM900A SMS
   - Offline approval fallback
   - Backend is source of truth
====================================================== */
export const getEspContacts = async (req, res) => {
  try {
    const members = await Member.find({
      ownerId: req.ownerId, // dynamic now
      status: "ACTIVE",
    }).populate("userId", "name phone");

    const contacts = members.map((m) => ({
      name: m.userId.name,
      phone: m.userId.phone,
      relation: m.relation,
      role: m.role, // ✅ FAMILY | FRIEND
    }));

    res.json({
      success: true,
      contacts,
    });
  } catch (error) {
    console.error("ESP CONTACT FETCH ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ESP contacts",
    });
  }
};
