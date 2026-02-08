import { DeviceToken } from "./deviceToken.model.js";

const normalizePlatform = (value) => {
  const platform = String(value || "android").toLowerCase();
  if (platform === "ios" || platform === "web") {
    return platform;
  }
  return "android";
};

export const registerDeviceToken = async (req, res) => {
  const token = String(req.body?.token || "").trim();
  if (token.length < 20) {
    return res.status(400).json({ message: "Invalid device token" });
  }

  const platform = normalizePlatform(req.body?.platform);

  const doc = await DeviceToken.findOneAndUpdate(
    { token },
    {
      $set: {
        userId: req.user._id,
        token,
        platform,
        lastSeenAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.json({
    message: "Device token registered",
    tokenId: doc._id,
    platform: doc.platform,
  });
};

export const unregisterDeviceToken = async (req, res) => {
  const token = String(req.body?.token || "").trim();
  if (!token) {
    return res.status(400).json({ message: "Token is required" });
  }

  await DeviceToken.deleteOne({
    token,
    userId: req.user._id,
  });

  res.json({ message: "Device token removed" });
};

