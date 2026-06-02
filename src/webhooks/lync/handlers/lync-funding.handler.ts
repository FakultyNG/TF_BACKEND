import { Injectable } from "@nestjs/common";
import { LedgerEntryType, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { WalletService } from "../../../wallet/wallet.service";
import { NormalizedWebhookEvent } from "../../common/webhook-event-normalizer";
import { WebhookLogService } from "../../common/webhook-log.service";

@Injectable()
export class LyncFundingHandler {
  private readonly provider = "lync";

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly logs: WebhookLogService
  ) {}

  async handle(event: NormalizedWebhookEvent, payload: unknown) {
    if (event.status && event.status !== TransactionStatus.successful) {
      return { ignored: true, message: "Funding event is not successful" };
    }
    const amount = event.amount;
    if (!amount || amount <= 0) return { ignored: true, message: "Funding amount missing" };

    const existing = await this.findTransaction(event);
    if (existing) {
      await this.prisma.transaction.update({
        where: { id: existing.id },
        data: { status: TransactionStatus.successful, providerStatus: TransactionStatus.successful, completedAt: new Date() }
      });
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
    await this.auditMoneyEvent(userId, result.transaction.id, "WEBHOOK_WALLET_CREDITED", {
      amount,
      providerReference: event.providerReference ?? null
    });
    return { entityType: "Transaction", entityId: result.transaction.id };
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

  private auditMoneyEvent(userId: string, transactionId: string, action: string, metadata: Prisma.InputJsonObject) {
    return this.prisma.auditLog.create({
      data: { actorId: userId, actorType: "system", action, entityType: "Transaction", entityId: transactionId, metadata }
    });
  }
}
