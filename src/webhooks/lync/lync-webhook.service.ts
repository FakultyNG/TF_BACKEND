import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { IncomingHttpHeaders } from "http";
import { ApiException } from "../../common/errors/api.exception";
import { PrismaService } from "../../prisma/prisma.service";
import { WalletService } from "../../wallet/wallet.service";
import {
  eventKey,
  normalizeWebhookEvent,
  payloadHasAnyEvent,
  NormalizedWebhookEvent
} from "../common/webhook-event-normalizer";
import { WebhookLogService } from "../common/webhook-log.service";
import { WebhookSignatureService } from "../common/webhook-signature.service";
import { LyncDvaHandler } from "./handlers/lync-dva.handler";
import { LyncFundingHandler } from "./handlers/lync-funding.handler";
import { LyncNgnTransferHandler } from "./handlers/lync-ngn-transfer.handler";
import { LyncPayoutHandler } from "./handlers/lync-payout.handler";

@Injectable()
export class LyncWebhookService {
  private readonly provider = "lync";

  constructor(
    private readonly prisma: PrismaService,
    _walletService: WalletService,
    private readonly logs: WebhookLogService,
    private readonly signatures: WebhookSignatureService,
    private readonly dvaHandler?: LyncDvaHandler,
    private readonly fundingHandler?: LyncFundingHandler,
    private readonly ngnTransferHandler?: LyncNgnTransferHandler,
    private readonly payoutHandler?: LyncPayoutHandler
  ) {}

  async receive(payload: unknown, headers: IncomingHttpHeaders) {
    const event = normalizeWebhookEvent(payload);
    const signatureValid = this.signatures.verify(payload, headers, this.signatures.secret("LYNC_WEBHOOK_SECRET"));
    const log = await this.logs.createReceived(this.provider, event, payload, signatureValid);
    if (!signatureValid) {
      await this.logs.markFailed(log.id, "Invalid webhook signature");
      throw new ApiException("Invalid webhook signature", "INVALID_WEBHOOK_SIGNATURE", HttpStatus.UNAUTHORIZED);
    }
    return this.process(log.id, event, payload);
  }

  async retry(webhookLogId: string) {
    const log = await this.prisma.webhookLog.findUnique({ where: { id: webhookLogId } });
    if (!log) throw new ApiException("Webhook log not found", "WEBHOOK_LOG_NOT_FOUND", HttpStatus.NOT_FOUND);
    return this.process(log.id, normalizeWebhookEvent(log.rawPayload), log.rawPayload);
  }

  private async process(logId: string, event: NormalizedWebhookEvent, payload: unknown) {
    const key = eventKey(this.provider, event, logId);
    if (await this.logs.isProcessed(key)) {
      await this.logs.markDuplicate(logId);
      return { duplicate: true };
    }

    try {
      const outcome = await this.dispatch(event, payload);
      if (outcome.ignored) {
        await this.logs.markIgnored(logId, outcome.message);
        return { duplicate: false };
      }
      const recorded = await this.logs.recordProcessedKey(key, this.provider, event.eventType);
      if (!recorded) {
        await this.logs.markDuplicate(logId);
        return { duplicate: true };
      }
      await this.logs.markProcessed(logId, this.provider, event, outcome.entityType ?? "Webhook", outcome.entityId);
      return { duplicate: false };
    } catch (error) {
      if (this.isUniqueError(error)) {
        await this.logs.markDuplicate(logId);
        return { duplicate: true };
      }
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      await this.logs.markFailed(logId, message);
      await this.auditFailure(logId, event, message);
      throw error;
    }
  }

  private async dispatch(event: NormalizedWebhookEvent, payload: unknown) {
    if (payloadHasAnyEvent(event.eventType, ["funding", "deposit", "collection"])) {
      return this.fundingHandler ? this.fundingHandler.handle(event, payload) : { ignored: true, message: "Lync funding handler unavailable" };
    }
    if (payloadHasAnyEvent(event.eventType, ["payout", "payment", "usd", "cny"])) {
      return this.payoutHandler ? this.payoutHandler.handle(event) : { ignored: true, message: "Lync payout handler unavailable" };
    }
    if (payloadHasAnyEvent(event.eventType, ["transfer", "ngn"])) {
      return this.ngnTransferHandler ? this.ngnTransferHandler.handle(event) : { ignored: true, message: "Lync NGN transfer handler unavailable" };
    }
    if (payloadHasAnyEvent(event.eventType, ["dva", "virtual_account", "virtual-account"])) {
      return this.dvaHandler ? this.dvaHandler.handle(event, payload) : { ignored: true, message: "Lync DVA handler unavailable" };
    }
    return { ignored: true, message: "Unsupported Lync webhook event" };
  }

  private isUniqueError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }

  private auditFailure(logId: string, event: NormalizedWebhookEvent, message: string) {
    return this.prisma.auditLog.create({
      data: { actorType: "system", action: "WEBHOOK_PROCESSING_FAILED", entityType: "WebhookLog", entityId: logId, metadata: { provider: this.provider, eventType: event.eventType, message } }
    });
  }

}
