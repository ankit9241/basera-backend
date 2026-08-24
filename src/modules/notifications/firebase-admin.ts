import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getMessaging, Messaging, SendResponse } from "firebase-admin/messaging";

let appInstance: App | null = null;
let messagingInstance: Messaging | null = null;

function initFirebaseAdmin(): boolean {
  if (messagingInstance) return true;
  if (getApps().length > 0) {
    appInstance = getApps()[0]!;
    messagingInstance = getMessaging(appInstance);
    return true;
  }

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      appInstance = initializeApp({
        credential: cert(serviceAccount),
      });
      messagingInstance = getMessaging(appInstance);
      return true;
    }

    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
      appInstance = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
      });
      messagingInstance = getMessaging(appInstance);
      return true;
    }
  } catch (error) {
    console.error("[FCM] Failed to initialize Firebase Admin SDK:", error);
  }

  return false;
}

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  tokens: string[];
};

export type PushResult = {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
  errors: Array<{ token: string; error: string }>;
};

export async function sendMulticastPush(payload: PushPayload): Promise<PushResult> {
  const result: PushResult = {
    successCount: 0,
    failureCount: 0,
    invalidTokens: [],
    errors: [],
  };

  if (!payload.tokens || payload.tokens.length === 0) {
    return result;
  }

  const hasFCM = initFirebaseAdmin();

  if (!hasFCM || !messagingInstance) {
    console.log(`[FCM_DEV_MOCK] Prepared push notification for ${payload.tokens.length} devices: "${payload.title}" - "${payload.body}"`);
    result.successCount = payload.tokens.length;
    return result;
  }

  try {
    const response = await messagingInstance.sendEachForMulticast({
      tokens: payload.tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
      webpush: {
        fcmOptions: {
          link: payload.data?.url || "/admin/visits",
        },
        notification: {
          title: payload.title,
          body: payload.body,
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-72.png",
          requireInteraction: true,
        },
      },
    });

    result.successCount = response.successCount;
    result.failureCount = response.failureCount;

    response.responses.forEach((resp: SendResponse, index: number) => {
      const token = payload.tokens[index]!;
      if (!resp.success) {
        const errorCode = resp.error?.code || "unknown";
        result.errors.push({ token, error: errorCode });
        if (
          errorCode === "messaging/registration-token-not-registered" ||
          errorCode === "messaging/invalid-registration-token" ||
          errorCode === "messaging/invalid-argument"
        ) {
          result.invalidTokens.push(token);
        }
      }
    });
  } catch (error: any) {
    console.error("[FCM] Critical error during multicast push:", error);
    result.failureCount = payload.tokens.length;
  }

  return result;
}
