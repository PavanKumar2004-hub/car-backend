import jwt from "jsonwebtoken";
import { User } from "../modules/auth/user.model.js";

export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  try {
    const token = authHeader.split(" ")[1];

    // 1. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 2. Fetch user from DB
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    // 3. Attach user to request (GLOBAL identity only)
    req.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role, // ADMIN | USER
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
