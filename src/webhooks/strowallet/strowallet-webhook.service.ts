import { HttpStatus, Injectable } from "@nestjs/common";
import { LedgerEntryType, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { ApiException } from "../../common/errors/api.exception";
import { PrismaService } from "../../prisma/prisma.service";
import { StrowalletService } from "../../providers/strowallet/strowallet.service";
import { WalletService } from "../../wallet/wallet.service";
import { WebhookLogService } from "../common/webhook-log.service";
import { NormalizedWebhookEvent, asRecord, eventKey, firstNumber, firstString, normalizeProviderStatus } from "../common/webhook-event-normalizer";

@Injectable()
export class StrowalletWebhookService {
  private readonly provider = "strowallet";

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly logs: WebhookLogService,
    private readonly strowallet: StrowalletService
  ) {}

  async receiveVirtualAccountCredit(payload: unknown) {
    const verified = await this.strowallet.verifyVirtualAccountWebhook(payload);
    const event = this.normalizeVirtualAccountCredit(payload);
    const log = await this.logs.createReceived(this.provider, event, payload, verified);
    if (!verified) {
      await this.logs.markFailed(log.id, "Strowallet virtual account webhook could not be verified");
      throw new ApiException("Invalid Strowallet webhook", "INVALID_STROWALLET_WEBHOOK", HttpStatus.UNAUTHORIZED);
    }
    return this.process(log.id, event, payload, "virtual-account");
  }

  async receiveBankTransfer(payload: unknown) {
    const verified = await this.strowallet.verifyTransferWebhook(payload);
    const event = this.normalizeBankTransfer(payload);
    const log = await this.logs.createReceived(this.provider, event, payload, verified);
    if (!verified) {
      await this.logs.markFailed(log.id, "Strowallet bank transfer webhook could not be verified");
      throw new ApiException("Invalid Strowallet webhook", "INVALID_STROWALLET_WEBHOOK", HttpStatus.UNAUTHORIZED);
    }
    return this.process(log.id, event, payload, "bank-transfer");
  }

  private async process(logId: string, event: NormalizedWebhookEvent, payload: unknown, kind: "virtual-account" | "bank-transfer") {
    const key = eventKey(this.provider, event, logId);
    if (await this.logs.isProcessed(key)) {
      await this.logs.markDuplicate(logId);
      return { duplicate: true };
    }

    try {
      const outcome = kind === "virtual-account"
        ? await this.handleVirtualAccountCredit(event, payload)
        : await this.handleBankTransfer(event);
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
      const message = error instanceof Error ? error.message : "Strowallet webhook processing failed";
      await this.logs.markFailed(logId, message);
      await this.auditFailure(logId, event, message);
      throw error;
    }
  }

  private async handleVirtualAccountCredit(event: NormalizedWebhookEvent, payload: unknown) {
    if (event.status && event.status !== TransactionStatus.successful) {
      return { ignored: true, message: "Virtual account credit is not successful" };
    }
    if (!event.amount || event.amount <= 0) return { ignored: true, message: "Credit amount missing" };

    const dva = await this.prisma.dedicatedVirtualAccount.findFirst({
      where: {
        OR: [
          event.accountNumber ? { accountNumber: event.accountNumber } : undefined,
          event.providerReference ? { providerReference: event.providerReference } : undefined
        ].filter(Boolean) as Prisma.DedicatedVirtualAccountWhereInput[]
      }
    });
    if (!dva) return { ignored: true, message: "Virtual account could not be matched" };

    const reference = event.internalReference ?? event.providerReference ?? `strowallet_funding_${Date.now()}`;
    const result = await this.walletService.creditWallet({
      userId: dva.userId,
      amount: event.amount,
      type: TransactionType.wallet_funding,
      status: TransactionStatus.successful,
      reference,
      provider: this.provider,
      providerReference: event.providerReference,
      description: "Wallet funding confirmed by Strowallet webhook",
      idempotencyKey: `webhook:${this.provider}:funding:${event.providerReference ?? reference}`,
      entryType: LedgerEntryType.credit,
      metadata: this.logs.toJson(this.logs.sanitize(payload))
    });
    await this.logs.notifyUser({
      userId: dva.userId,
      title: "Wallet funded",
      message: "Your wallet funding was successful.",
      category: "transaction",
      type: "wallet_funding"
    });
    return { entityType: "Transaction", entityId: result.transaction.id };
  }

  private async handleBankTransfer(event: NormalizedWebhookEvent) {
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        type: TransactionType.ngn_transfer,
        OR: [
          event.providerReference ? { providerReference: event.providerReference } : undefined,
          event.internalReference ? { reference: event.internalReference } : undefined,
          event.providerReference ? { reference: event.providerReference } : undefined
        ].filter(Boolean) as Prisma.TransactionWhereInput[]
      }
    });
    if (!transaction) return { ignored: true, message: "Bank transfer transaction could not be matched" };

    if (event.status === TransactionStatus.successful) {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.successful, providerStatus: TransactionStatus.successful, completedAt: new Date() }
      });
      await this.logs.notifyUser({
        userId: transaction.userId,
        title: "Transfer successful",
        message: "Your NGN transfer was successful.",
        category: "transaction",
        type: "transfer_success"
      });
    } else if (event.status === TransactionStatus.failed || event.status === TransactionStatus.reversed || event.status === "cancelled") {
      if (transaction.status !== TransactionStatus.reversed) {
        await this.walletService.reverseTransaction(undefined, transaction.id, "NGN transfer reversed by Strowallet webhook");
      }
      await this.logs.notifyUser({
        userId: transaction.userId,
        title: "Transfer reversed",
        message: "Your NGN transfer was reversed.",
        category: "transaction",
        type: "transfer_failed",
        priority: "high"
      });
    } else if (event.status) {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: event.status as TransactionStatus, providerStatus: event.status }
      });
    }
    return { entityType: "Transaction", entityId: transaction.id };
  }

  private normalizeVirtualAccountCredit(payload: unknown): NormalizedWebhookEvent {
    const body = asRecord(payload);
    return {
      eventType: "virtual_account.credit",
      providerReference: firstString(body.sessionId, body.sessionID, body.settlementId),
      internalReference: firstString(body.initiationTranRef),
      status: TransactionStatus.successful,
      amount: firstNumber(body.transactionAmount, body.amount, body.settledAmount),
      currency: firstString(body.currency) || "NGN",
      accountNumber: firstString(body.accountNumber, body.account_number)
    };
  }

  private normalizeBankTransfer(payload: unknown): NormalizedWebhookEvent {
    const body = asRecord(payload);
    const status = firstString(body.status);
    return {
      eventType: firstString(body.event) || "banktransfer.unknown",
      providerReference: firstString(body.merchantTxRef, body.merchant_tx_ref, body.sessionId, body.sessionID),
      internalReference: firstString(body.merchantTxRef, body.merchant_tx_ref),
      status: status ? normalizeProviderStatus(status) : undefined,
      amount: firstNumber(body.amount),
      currency: "NGN",
      accountNumber: firstString(body.accountNumber, body.account_number)
    };
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
