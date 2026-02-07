import { comparePassword, hashPassword } from "./auth.utils.js";
import { generateToken } from "./jwt.utils.js";
import { User } from "./user.model.js";

export const register = async (req, res) => {
  const { name, email, password, phone } = req.body;

  const existing = await User.findOne({
    $or: [{ email }, { phone }],
  });

  if (existing) {
    return res.status(400).json({ message: "User already exists" });
  }

  const hashed = await hashPassword(password);

  const user = await User.create({
    name,
    email,
    phone,
    password: hashed,
  });

  res.status(201).json({
    message: "User registered",
    userId: user._id,
  });
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const isMatch = await comparePassword(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = generateToken({
    id: user._id.toString(),
    role: user.role,
  });

  res.json({
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role, // ADMIN | USER
    },
  });
};
