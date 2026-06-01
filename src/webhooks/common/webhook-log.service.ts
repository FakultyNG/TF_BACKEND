import { Injectable } from "@nestjs/common";
import { NotificationAudience, NotificationStatus, Prisma } from "@prisma/client";
import { NotificationsService } from "../../notifications/notifications.service";
import { PrismaService } from "../../prisma/prisma.service";
import { NormalizedWebhookEvent } from "./webhook-event-normalizer";

@Injectable()
export class WebhookLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  createReceived(provider: string, event: NormalizedWebhookEvent, payload: unknown, signatureValid: boolean) {
    return this.prisma.webhookLog.create({
      data: {
        provider,
        eventType: event.eventType,
        providerReference: event.providerReference,
        internalReference: event.internalReference,
        rawPayload: this.toJson(this.sanitize(payload)),
        normalizedPayload: this.toJson(event),
        signatureValid
      }
    });
  }

  markProcessed(logId: string, provider: string, event: NormalizedWebhookEvent, internalEntityType: string, internalEntityId?: string) {
    return this.prisma.$transaction([
      this.prisma.webhookLog.update({
        where: { id: logId },
        data: { status: "processed", processedAt: new Date(), errorMessage: null, normalizedPayload: this.toJson(event) }
      }),
      this.prisma.webhookEvent.create({
        data: {
          webhookLogId: logId,
          provider,
          eventType: event.eventType,
          providerReference: event.providerReference,
          internalEntityType,
          internalEntityId,
          processingStatus: "processed",
          processedAt: new Date()
        }
      })
    ]);
  }

  markFailed(logId: string, message: string) {
    return this.prisma.webhookLog.update({
      where: { id: logId },
      data: { status: "failed", errorMessage: message, processedAt: new Date() }
    });
  }

  markIgnored(logId: string, message: string) {
    return this.prisma.webhookLog.update({
      where: { id: logId },
      data: { status: "ignored", errorMessage: message, processedAt: new Date() }
    });
  }

  markDuplicate(logId: string) {
    return this.prisma.webhookLog.update({
      where: { id: logId },
      data: { status: "duplicate", processedAt: new Date() }
    });
  }

  async isProcessed(key: string) {
    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    return Boolean(existing);
  }

  async recordProcessedKey(key: string, provider: string, eventType: string) {
    try {
      await this.prisma.idempotencyKey.create({
        data: { key, provider, eventType, processedAt: new Date() }
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  async notifyUser(input: { userId: string; title: string; message: string; category: string; type: string; priority?: string; deepLink?: string }) {
    await this.notifications.createAndPushNotification({
      title: input.title,
      message: input.message,
      category: input.category,
      type: input.type,
      priority: input.priority ?? "normal",
      audience: NotificationAudience.specific_user,
      targetUserId: input.userId,
      status: NotificationStatus.published,
      deepLink: input.deepLink
    });
  }

  sanitize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sanitize(item));
    if (!value || typeof value !== "object") return value;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = this.isSensitiveKey(key) ? "***MASKED***" : this.sanitize(child);
    }
    return output;
  }

  toJson(value: unknown): Prisma.InputJsonValue {
    return this.stripUndefined(value) as Prisma.InputJsonValue;
  }

  private stripUndefined(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.stripUndefined(item));
    if (!value || typeof value !== "object") return value;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) output[key] = this.stripUndefined(child);
    }
    return output;
  }

  private isSensitiveKey(key: string) {
    const lower = key.toLowerCase();
    if (["code", "pin", "otp"].includes(lower)) return true;
    return ["bvn", "nin", "token", "secret", "authorization", "redemptioncode", "giftcode"].some((part) => lower.includes(part));
  }
}
