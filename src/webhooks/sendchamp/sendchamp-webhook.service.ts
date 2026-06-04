import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { IncomingHttpHeaders } from "http";
import { ApiException } from "../../common/errors/api.exception";
import { PrismaService } from "../../prisma/prisma.service";
import { eventKey, normalizeWebhookEvent, NormalizedWebhookEvent } from "../common/webhook-event-normalizer";
import { WebhookLogService } from "../common/webhook-log.service";
import { WebhookSignatureService } from "../common/webhook-signature.service";

@Injectable()
export class SendchampWebhookService {
  private readonly provider = "sendchamp";

  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: WebhookLogService,
    private readonly signatures: WebhookSignatureService
  ) {}

  async receive(payload: unknown, headers: IncomingHttpHeaders) {
    const event = normalizeWebhookEvent(payload);
    const signatureValid = this.signatures.verify(payload, headers, this.signatures.secret("SENDCHAMP_WEBHOOK_SECRET"));
    const log = await this.logs.createReceived(this.provider, event, payload, signatureValid);
    if (!signatureValid) {
      await this.logs.markFailed(log.id, "Invalid webhook signature");
      throw new ApiException("Invalid webhook signature", "INVALID_WEBHOOK_SIGNATURE", HttpStatus.UNAUTHORIZED);
    }
    return this.process(log.id, event);
  }

  async retry(webhookLogId: string) {
    const log = await this.prisma.webhookLog.findUnique({ where: { id: webhookLogId } });
    if (!log) throw new ApiException("Webhook log not found", "WEBHOOK_LOG_NOT_FOUND", HttpStatus.NOT_FOUND);
    return this.process(log.id, normalizeWebhookEvent(log.rawPayload));
  }

  private async process(logId: string, event: NormalizedWebhookEvent) {
    const key = eventKey(this.provider, event, logId);
    if (await this.logs.isProcessed(key)) {
      await this.logs.markDuplicate(logId);
      return { duplicate: true };
    }

    try {
      const recorded = await this.logs.recordProcessedKey(key, this.provider, event.eventType);
      if (!recorded) {
        await this.logs.markDuplicate(logId);
        return { duplicate: true };
      }
      await this.logs.markProcessed(logId, this.provider, event, "OtpDelivery", event.providerReference);
      return { duplicate: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await this.logs.markDuplicate(logId);
        return { duplicate: true };
      }
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      await this.logs.markFailed(logId, message);
      await this.prisma.auditLog.create({
        data: {
          actorType: "system",
          action: "WEBHOOK_PROCESSING_FAILED",
          entityType: "WebhookLog",
          entityId: logId,
          metadata: { provider: this.provider, eventType: event.eventType, message }
        }
      });
      throw error;
    }
  }
}
