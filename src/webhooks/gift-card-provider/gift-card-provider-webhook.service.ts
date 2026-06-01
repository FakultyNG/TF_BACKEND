import { HttpStatus, Injectable } from "@nestjs/common";
import { GiftCardPurchaseStatus, Prisma, TransactionStatus } from "@prisma/client";
import { IncomingHttpHeaders } from "http";
import { ApiException } from "../../common/errors/api.exception";
import { PrismaService } from "../../prisma/prisma.service";
import { WalletService } from "../../wallet/wallet.service";
import { eventKey, normalizeWebhookEvent, NormalizedWebhookEvent } from "../common/webhook-event-normalizer";
import { WebhookLogService } from "../common/webhook-log.service";
import { WebhookSignatureService } from "../common/webhook-signature.service";

@Injectable()
export class GiftCardProviderWebhookService {
  private readonly provider = "reeplay";

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly logs: WebhookLogService,
    private readonly signatures: WebhookSignatureService
  ) {}

  async receive(payload: unknown, headers: IncomingHttpHeaders) {
    const event = normalizeWebhookEvent(payload);
    const signatureValid = this.signatures.verify(payload, headers, this.signatures.secret("REEPLAY_PROVIDER_WEBHOOK_SECRET"));
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
      const purchase = await this.findPurchase(event);
      if (!purchase) {
        await this.logs.markIgnored(logId, "Gift card purchase could not be matched");
        return { duplicate: false };
      }

      if (event.status === TransactionStatus.successful) {
        await this.prisma.$transaction([
          this.prisma.giftCardPurchase.update({
            where: { id: purchase.id },
            data: { status: GiftCardPurchaseStatus.delivered, metadata: this.logs.toJson(this.logs.sanitize(payload)) }
          }),
          this.prisma.transaction.update({
            where: { id: purchase.transactionId },
            data: { status: TransactionStatus.successful, completedAt: new Date() }
          })
        ]);
        await this.logs.notifyUser({ userId: purchase.userId, title: "Gift card delivered", message: "Your gift card purchase was delivered.", category: "transaction", type: "transfer_success" });
      } else if (event.status === TransactionStatus.failed || event.status === TransactionStatus.reversed || event.status === "cancelled") {
        await this.prisma.giftCardPurchase.update({ where: { id: purchase.id }, data: { status: GiftCardPurchaseStatus.failed } });
        if (purchase.transaction.status !== TransactionStatus.reversed) {
          await this.walletService.reverseTransaction(undefined, purchase.transactionId, "Gift card purchase reversed by provider webhook");
        }
        await this.logs.notifyUser({ userId: purchase.userId, title: "Gift card purchase failed", message: "Your gift card purchase failed and was reversed.", category: "transaction", type: "transfer_failed", priority: "high" });
      }

      const recorded = await this.logs.recordProcessedKey(key, this.provider, event.eventType);
      if (!recorded) {
        await this.logs.markDuplicate(logId);
        return { duplicate: true };
      }
      await this.logs.markProcessed(logId, this.provider, event, "GiftCardPurchase", purchase.id);
      return { duplicate: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await this.logs.markDuplicate(logId);
        return { duplicate: true };
      }
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      await this.logs.markFailed(logId, message);
      await this.prisma.auditLog.create({
        data: { actorType: "system", action: "WEBHOOK_PROCESSING_FAILED", entityType: "WebhookLog", entityId: logId, metadata: { provider: this.provider, eventType: event.eventType, message } }
      });
      throw error;
    }
  }

  private findPurchase(event: NormalizedWebhookEvent) {
    return this.prisma.giftCardPurchase.findFirst({
      where: {
        OR: [
          event.providerReference ? { providerReference: event.providerReference } : undefined,
          event.internalReference ? { transaction: { reference: event.internalReference } } : undefined,
          event.providerReference ? { transaction: { reference: event.providerReference } } : undefined
        ].filter(Boolean) as Prisma.GiftCardPurchaseWhereInput[]
      },
      include: { transaction: true }
    });
  }
}
