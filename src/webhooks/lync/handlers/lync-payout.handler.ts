import { Injectable } from "@nestjs/common";
import { Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { WalletService } from "../../../wallet/wallet.service";
import { NormalizedWebhookEvent } from "../../common/webhook-event-normalizer";
import { WebhookLogService } from "../../common/webhook-log.service";

@Injectable()
export class LyncPayoutHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly logs: WebhookLogService
  ) {}

  async handle(event: NormalizedWebhookEvent) {
    const transaction = await this.findPayoutTransaction(event);
    if (!transaction) return { ignored: true, message: "Payout transaction could not be matched" };

    if (event.status === TransactionStatus.successful) {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.successful, providerStatus: TransactionStatus.successful, completedAt: new Date() }
      });
      await this.logs.notifyUser({
        userId: transaction.userId,
        title: "Supplier payment successful",
        message: "Your international payout was successful.",
        category: "transaction",
        type: "transfer_success"
      });
    } else if (event.status === TransactionStatus.failed || event.status === TransactionStatus.reversed || event.status === "cancelled") {
      if (transaction.status !== TransactionStatus.reversed) {
        await this.walletService.reverseTransaction(undefined, transaction.id, "Payout reversed by Lync webhook");
      }
      await this.logs.notifyUser({
        userId: transaction.userId,
        title: "Supplier payment reversed",
        message: "Your international payout failed and was reversed.",
        category: "transaction",
        type: "transfer_failed",
        priority: "high"
      });
    } else if (event.status) {
      await this.prisma.transaction.update({ where: { id: transaction.id }, data: { status: event.status as TransactionStatus, providerStatus: event.status } });
    }

    return { entityType: "Transaction", entityId: transaction.id };
  }

  private findPayoutTransaction(event: NormalizedWebhookEvent) {
    return this.prisma.transaction.findFirst({
      where: {
        type: { in: [TransactionType.usd_transfer, TransactionType.cny_transfer] },
        OR: [
          event.providerReference ? { providerReference: event.providerReference } : undefined,
          event.internalReference ? { reference: event.internalReference } : undefined,
          event.providerReference ? { reference: event.providerReference } : undefined
        ].filter(Boolean) as Prisma.TransactionWhereInput[]
      }
    });
  }
}
