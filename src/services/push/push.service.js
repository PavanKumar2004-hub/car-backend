import { DeviceToken } from "../../modules/notifications/deviceToken.model.js";

const CHANNEL_IDS = {
  ACCIDENT: "accident_alerts",
  REQUEST: "request_alerts",
  ALCOHOL_WARN: "alcohol_warn_alerts",
  ALCOHOL_HIGH: "alcohol_high_alerts",
};

let warnedConfigMissing = false;
let warnedPackageMissing = false;
let adminModule = null;
let adminModulePromise = null;

const loadFirebaseAdmin = async () => {
  if (adminModule) {
    return adminModule;
  }

  if (!adminModulePromise) {
    adminModulePromise = import("firebase-admin")
      .then((module) => module.default ?? module)
      .catch(() => null);
  }

  const loaded = await adminModulePromise;
  if (!loaded) {
    if (!warnedPackageMissing) {
      warnedPackageMissing = true;
      console.warn(
        "Push notifications disabled: firebase-admin package is not installed",
      );
    }
    return null;
  }

  adminModule = loaded;
  return adminModule;
};

const parseServiceAccount = () => {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!rawJson && !rawBase64) {
    return null;
  }

  try {
    const source = rawBase64
      ? Buffer.from(rawBase64, "base64").toString("utf8")
      : rawJson;
    const parsed = JSON.parse(source);

    if (typeof parsed.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }

    return parsed;
  } catch {
    return null;
  }
};

const getMessaging = async () => {
  const admin = await loadFirebaseAdmin();
  if (!admin) {
    return null;
  }

  if (!admin.apps.length) {
    const serviceAccount = parseServiceAccount();
    if (!serviceAccount) {
      if (!warnedConfigMissing) {
        warnedConfigMissing = true;
        console.warn(
          "Push notifications disabled: FIREBASE_SERVICE_ACCOUNT_JSON/FIREBASE_SERVICE_ACCOUNT_BASE64 is missing or invalid",
        );
      }
      return null;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  return admin.messaging();
};

const toStringData = (data = {}) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, String(value ?? "")]),
  );

const getChannelId = (type) => {
  if (type === "ACCIDENT") return CHANNEL_IDS.ACCIDENT;
  if (type === "REQUEST") return CHANNEL_IDS.REQUEST;
  if (type === "ALCOHOL_HIGH") return CHANNEL_IDS.ALCOHOL_HIGH;
  if (type === "ALCOHOL_WARN") return CHANNEL_IDS.ALCOHOL_WARN;
  return CHANNEL_IDS.REQUEST;
};

export const sendPushToUserIds = async ({
  userIds,
  title,
  body,
  type = "REQUEST",
  data = {},
}) => {
  const messaging = await getMessaging();
  if (!messaging) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const normalizedUserIds = [...new Set((userIds || []).map((id) => String(id)))];
  if (normalizedUserIds.length === 0) {
    return { sent: 0, failed: 0, skipped: false };
  }

  const tokens = await DeviceToken.find({
    userId: { $in: normalizedUserIds },
  }).select("token");

  if (!tokens.length) {
    return { sent: 0, failed: 0, skipped: false };
  }

  const channelId = getChannelId(type);

  const payloadData = toStringData({
    ...data,
    type,
    clickAction: "OPEN_DASHBOARD",
  });

  const messages = tokens.map((item) => ({
    token: item.token,
    notification: {
      title,
      body,
    },
    data: payloadData,
    android: {
      priority: "high",
      notification: {
        channelId,
        clickAction: "OPEN_DASHBOARD",
        sound: "default",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  }));

  const response = await messaging.sendEach(messages);

  const staleTokens = [];

  response.responses.forEach((result, index) => {
    if (result.success) {
      return;
    }

    const errorCode = result.error?.code || "";
    if (
      errorCode.includes("registration-token-not-registered") ||
      errorCode.includes("invalid-registration-token")
    ) {
      staleTokens.push(tokens[index].token);
    }
  });

  if (staleTokens.length > 0) {
    await DeviceToken.deleteMany({ token: { $in: staleTokens } });
  }

  return {
    sent: response.successCount,
    failed: response.failureCount,
    skipped: false,
  };
};
