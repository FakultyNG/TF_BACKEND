import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { cert, getApps, initializeApp, App } from "firebase-admin/app";
import { getMessaging, Message, MulticastMessage } from "firebase-admin/messaging";

export interface FcmSendResult {
  success: boolean;
  messageId?: string;
  errorCode?: string;
  skipped?: boolean;
}

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private app?: App;

  constructor(private readonly config: ConfigService) {}

  sendToDevice(token: string, payload: Omit<Message, "token">): Promise<FcmSendResult> {
    if (!this.isEnabled()) return Promise.resolve({ success: false, skipped: true, errorCode: "FCM_DISABLED" });
    return getMessaging(this.getApp())
      .send({ ...payload, token })
      .then((messageId) => ({ success: true, messageId }))
      .catch((error: { code?: string; message?: string }) => {
        this.logger.warn(`FCM send failed: ${error.code ?? error.message ?? "unknown"}`);
        return { success: false, errorCode: error.code ?? "FCM_SEND_FAILED" };
      });
  }

  async sendToMultipleDevices(tokens: string[], payload: Omit<MulticastMessage, "tokens">) {
    if (!tokens.length) return { successCount: 0, failureCount: 0, responses: [] };
    if (!this.isEnabled()) {
      return {
        successCount: 0,
        failureCount: 0,
        responses: tokens.map(() => ({ success: false, skipped: true, errorCode: "FCM_DISABLED" }))
      };
    }
    const response = await getMessaging(this.getApp()).sendEachForMulticast({ ...payload, tokens });
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses.map((item) => ({
        success: item.success,
        messageId: item.messageId,
        errorCode: item.error?.code
      }))
    };
  }

  sendToTopic(topic: string, payload: Omit<Message, "topic">): Promise<FcmSendResult> {
    if (!this.isEnabled()) return Promise.resolve({ success: false, skipped: true, errorCode: "FCM_DISABLED" });
    return getMessaging(this.getApp())
      .send({ ...payload, topic })
      .then((messageId) => ({ success: true, messageId }))
      .catch((error: { code?: string; message?: string }) => ({ success: false, errorCode: error.code ?? "FCM_SEND_FAILED" }));
  }

  isInvalidTokenError(code?: string) {
    return [
      "registration-token-not-registered",
      "invalid-registration-token",
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token"
    ].includes(code ?? "");
  }

  private isEnabled() {
    return this.config.get<string>("FCM_ENABLED", "true") !== "false" && Boolean(this.config.get<string>("FIREBASE_PROJECT_ID"));
  }

  private getApp() {
    if (this.app) return this.app;
    const existing = getApps()[0];
    if (existing) {
      this.app = existing;
      return existing;
    }
    const projectId = this.config.get<string>("FIREBASE_PROJECT_ID");
    const clientEmail = this.config.get<string>("FIREBASE_CLIENT_EMAIL");
    const privateKey = this.config.get<string>("FIREBASE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Firebase credentials are not configured");
    }
    this.app = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey })
    });
    return this.app;
  }
}
