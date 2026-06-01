import { HttpStatus, Injectable } from "@nestjs/common";
import { DvaStatus, LedgerEntryType, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { IncomingHttpHeaders } from "http";
import { ApiException } from "../../common/errors/api.exception";
import { PrismaService } from "../../prisma/prisma.service";
import { WalletService } from "../../wallet/wallet.service";
import {
  asRecord,
  eventKey,
  normalizeWebhookEvent,
  payloadHasAnyEvent,
  NormalizedWebhookEvent
} from "../common/webhook-event-normalizer";
import { WebhookLogService } from "../common/webhook-log.service";
import { WebhookSignatureService } from "../common/webhook-signature.service";

@Injectable()
export class LyncWebhookService {
  private readonly provider = "lync";

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly logs: WebhookLogService,
    private readonly signatures: WebhookSignatureService
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
    if (payloadHasAnyEvent(event.eventType, ["funding", "deposit", "collection"])) return this.handleFunding(event, payload);
    if (payloadHasAnyEvent(event.eventType, ["transfer", "ngn"])) return this.handleNgnTransfer(event);
    if (payloadHasAnyEvent(event.eventType, ["dva", "virtual_account", "virtual-account"])) return this.handleDva(event, payload);
    return { ignored: true, message: "Unsupported Lync webhook event" };
  }

  private async handleFunding(event: NormalizedWebhookEvent, payload: unknown) {
    if (event.status && event.status !== TransactionStatus.successful) {
      return { ignored: true, message: "Funding event is not successful" };
    }
    const amount = event.amount;
    if (!amount || amount <= 0) return { ignored: true, message: "Funding amount missing" };

    const existing = await this.findTransaction(event);
    if (existing) {
      await this.prisma.transaction.update({ where: { id: existing.id }, data: { status: TransactionStatus.successful, completedAt: new Date() } });
      return { entityType: "Transaction", entityId: existing.id };
    }

    const dva = await this.findDva(event);
    const userId = event.userId ?? dva?.userId;
    if (!userId) return { ignored: true, message: "Funding user could not be matched" };

    const reference = event.internalReference ?? event.providerReference ?? `lync_funding_${Date.now()}`;
    const result = await this.walletService.creditWallet({
      userId,
      amount,
      type: TransactionType.wallet_funding,
      status: TransactionStatus.successful,
      reference,
      provider: this.provider,
      providerReference: event.providerReference,
      description: "Wallet funding confirmed by webhook",
      idempotencyKey: `webhook:${this.provider}:funding:${event.providerReference ?? reference}`,
      entryType: LedgerEntryType.credit,
      metadata: this.logs.toJson(this.logs.sanitize(payload))
    });
    await this.logs.notifyUser({
      userId,
      title: "Wallet funded",
      message: "Your wallet funding was successful.",
      category: "transaction",
      type: "wallet_funding"
    });
    await this.auditMoneyEvent(userId, result.transaction.id, "WEBHOOK_WALLET_CREDITED", { amount, providerReference: event.providerReference ?? null });
    return { entityType: "Transaction", entityId: result.transaction.id };
  }

  private async handleNgnTransfer(event: NormalizedWebhookEvent) {
    const transaction = await this.findTransaction(event);
    if (!transaction) return { ignored: true, message: "NGN transfer transaction could not be matched" };
    if (event.status === TransactionStatus.successful) {
      await this.prisma.transaction.update({ where: { id: transaction.id }, data: { status: TransactionStatus.successful, completedAt: new Date() } });
      await this.logs.notifyUser({ userId: transaction.userId, title: "Transfer successful", message: "Your NGN transfer was successful.", category: "transaction", type: "transfer_success" });
    } else if (event.status === TransactionStatus.failed || event.status === TransactionStatus.reversed || event.status === "cancelled") {
      if (transaction.status !== TransactionStatus.reversed) {
        await this.walletService.reverseTransaction(undefined, transaction.id, "NGN transfer reversed by Lync webhook");
      }
      await this.logs.notifyUser({ userId: transaction.userId, title: "Transfer reversed", message: "Your NGN transfer was reversed.", category: "transaction", type: "transfer_failed", priority: "high" });
    } else if (event.status) {
      await this.prisma.transaction.update({ where: { id: transaction.id }, data: { status: event.status as TransactionStatus } });
    }
    return { entityType: "Transaction", entityId: transaction.id };
  }

  private async handleDva(event: NormalizedWebhookEvent, payload: unknown) {
    const body = asRecord(payload);
    const data = asRecord(body.data);
    const status = this.toDvaStatus(event.status);
    const accountNumber = event.accountNumber;
    const providerReference = event.providerReference;
    if (!providerReference && !accountNumber) return { ignored: true, message: "DVA reference missing" };
    const updated = await this.prisma.dedicatedVirtualAccount.updateMany({
      where: {
        OR: [
          providerReference ? { providerReference } : undefined,
          accountNumber ? { accountNumber } : undefined
        ].filter(Boolean) as Prisma.DedicatedVirtualAccountWhereInput[]
      },
      data: {
        status,
        providerReference,
        bankName: typeof data.bankName === "string" ? data.bankName : undefined,
        accountName: typeof data.accountName === "string" ? data.accountName : undefined
      }
    });
    if (!updated.count) return { ignored: true, message: "DVA could not be matched" };
    return { entityType: "DedicatedVirtualAccount", entityId: providerReference ?? accountNumber };
  }

  private findTransaction(event: NormalizedWebhookEvent) {
    return this.prisma.transaction.findFirst({
      where: {
        OR: [
          event.providerReference ? { providerReference: event.providerReference } : undefined,
          event.internalReference ? { reference: event.internalReference } : undefined,
          event.providerReference ? { reference: event.providerReference } : undefined
        ].filter(Boolean) as Prisma.TransactionWhereInput[]
      }
    });
  }

  private findDva(event: NormalizedWebhookEvent) {
    return this.prisma.dedicatedVirtualAccount.findFirst({
      where: {
        OR: [
          event.providerReference ? { providerReference: event.providerReference } : undefined,
          event.accountNumber ? { accountNumber: event.accountNumber } : undefined
        ].filter(Boolean) as Prisma.DedicatedVirtualAccountWhereInput[]
      }
    });
  }

  private toDvaStatus(status?: NormalizedWebhookEvent["status"]) {
    if (status === TransactionStatus.failed || status === "cancelled") return DvaStatus.failed;
    if (status === TransactionStatus.reversed) return DvaStatus.inactive;
    return DvaStatus.active;
  }

  private isUniqueError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }

  private auditFailure(logId: string, event: NormalizedWebhookEvent, message: string) {
    return this.prisma.auditLog.create({
      data: { actorType: "system", action: "WEBHOOK_PROCESSING_FAILED", entityType: "WebhookLog", entityId: logId, metadata: { provider: this.provider, eventType: event.eventType, message } }
    });
  }

  private auditMoneyEvent(userId: string, transactionId: string, action: string, metadata: Prisma.InputJsonObject) {
    return this.prisma.auditLog.create({
      data: { actorId: userId, actorType: "system", action, entityType: "Transaction", entityId: transactionId, metadata }
    });
  }
}
