import { HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";
import { TransactionStatus, TransactionType } from "@prisma/client";
import { offset, pagination } from "../common/dto/pagination-query.dto";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../prisma/prisma.service";
import { NGN_TRANSFER_PROVIDER } from "../providers/provider.tokens";
import { NgnTransferProviderService } from "../providers/transfers/ngn-transfer-provider.interface";
import { WalletService } from "../wallet/wallet.service";
import { TransactionQueryDto } from "./dto/transaction-query.dto";

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(NGN_TRANSFER_PROVIDER) private readonly ngnProvider?: NgnTransferProviderService,
    @Optional() private readonly walletService?: WalletService
  ) {}

  async listUserTransactions(userId: string, query: TransactionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      userId,
      type: query.type,
      status: query.status,
      currency: query.currency,
      createdAt: query.dateFrom || query.dateTo ? { gte: query.dateFrom ? new Date(query.dateFrom) : undefined, lte: query.dateTo ? new Date(query.dateTo) : undefined } : undefined
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        take: limit,
        skip: offset(page, limit),
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.transaction.count({ where })
    ]);
    return {
      items: items.map((transaction) => this.toListItem(transaction)),
      pagination: pagination(page, limit, total)
    };
  }

  async getUserTransaction(userId: string, id: string) {
    let transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: { giftCardPurchase: true, supportTickets: { select: { id: true, status: true, subject: true } } }
    });
    if (!transaction) throw new ApiException("Transaction not found", "TRANSACTION_NOT_FOUND", HttpStatus.NOT_FOUND);
    transaction = await this.reconcileNgnTransfer(transaction);
    return {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      fee: transaction.fee,
      totalDebit: transaction.totalDebit,
      currency: transaction.currency,
      payoutAmount: transaction.payoutAmount,
      payoutCurrency: transaction.payoutCurrency,
      status: transaction.status,
      reference: transaction.reference,
      description: this.publicDescription(transaction),
      narration: this.publicNarration(transaction),
      ...this.safeTransferDetails(transaction.metadata),
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
      relatedDetails: this.safeRelatedDetails(transaction)
    };
  }

  private toListItem(transaction: { id: string; type: TransactionType; amount: number; fee: number; totalDebit: number; currency: string; status: TransactionStatus; reference: string; description: string | null; narration: string | null; metadata: unknown; createdAt: Date }) {
    const transfer = this.safeTransferDetails(transaction.metadata);
    return {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      fee: transaction.fee,
      totalDebit: transaction.totalDebit,
      currency: transaction.currency,
      status: transaction.status,
      reference: transaction.reference,
      description: this.publicDescription(transaction),
      narration: this.publicNarration(transaction),
      ...transfer,
      createdAt: transaction.createdAt
    };
  }

  private safeRelatedDetails(transaction: { type: TransactionType; payoutAmount: number | null; payoutCurrency: string | null; giftCardPurchase?: { giftCardName: string; amount: number; currency: string; status: string } | null; supportTickets?: Array<{ id: string; status: string; subject: string }> }) {
    if (transaction.type === TransactionType.gift_card && transaction.giftCardPurchase) {
      return {
        giftCardName: transaction.giftCardPurchase.giftCardName,
        amount: transaction.giftCardPurchase.amount,
        currency: transaction.giftCardPurchase.currency,
        status: transaction.giftCardPurchase.status
      };
    }
    if (transaction.type === TransactionType.usd_transfer || transaction.type === TransactionType.cny_transfer) {
      return { payoutAmount: transaction.payoutAmount, payoutCurrency: transaction.payoutCurrency };
    }
    if (transaction.type === TransactionType.ngn_transfer) {
      return this.safeTransferDetails((transaction as { metadata?: unknown }).metadata);
    }
    if (transaction.supportTickets?.length) {
      return { supportTickets: transaction.supportTickets };
    }
    return null;
  }

  private safeTransferDetails(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
    const value = metadata as Record<string, unknown>;
    return {
      counterpartyName: typeof value.accountName === "string" ? value.accountName : undefined,
      counterpartyAccount: typeof value.accountNumber === "string" ? value.accountNumber : undefined,
      bankName: typeof value.bankName === "string" ? value.bankName : undefined,
      bankCode: typeof value.bankCode === "string" ? value.bankCode : undefined,
      counterpartyProfileImageUrl:
        typeof value.counterpartyProfileImageUrl === "string" ? value.counterpartyProfileImageUrl : undefined,
      memo: typeof value.memo === "string" ? value.memo : undefined,
      moneyLimitHold: value.moneyLimitHold === true,
      holdStatus: typeof value.holdStatus === "string" ? value.holdStatus : undefined,
      holdExpiresAt: typeof value.holdExpiresAt === "string" ? value.holdExpiresAt : undefined,
      requiredTier: typeof value.requiredTier === "string" ? value.requiredTier : undefined
    };
  }

  private publicDescription(transaction: { type: TransactionType; status: TransactionStatus; description: string | null }) {
    if (transaction.type === TransactionType.reversal) return "Transaction reversal";
    if (transaction.status !== TransactionStatus.failed && transaction.status !== TransactionStatus.reversed) {
      return transaction.description;
    }
    switch (transaction.type) {
      case TransactionType.ngn_transfer:
        return "Bank transfer";
      case TransactionType.usd_transfer:
      case TransactionType.cny_transfer:
        return "International transfer";
      case TransactionType.gift_card:
        return "Gift card purchase";
      case TransactionType.bill_payment:
        return "Bill payment";
      case TransactionType.wallet_funding:
        return "Wallet funding";
      case TransactionType.wallet_adjustment:
        return "Wallet adjustment";
      case TransactionType.fee:
        return "Transaction fee";
      default:
        return "Transaction";
    }
  }

  private publicNarration(transaction: { type: TransactionType; narration: string | null }) {
    // Operational reversal reasons belong in provider/audit logs, not in the
    // customer's transaction history.
    return transaction.type === TransactionType.reversal ? null : transaction.narration;
  }

  private async reconcileNgnTransfer<T extends {
    id: string;
    type: TransactionType;
    status: TransactionStatus;
    providerReference: string | null;
  }>(transaction: T): Promise<T> {
    if (
      transaction.type !== TransactionType.ngn_transfer ||
      transaction.status !== TransactionStatus.processing ||
      !transaction.providerReference ||
      !this.ngnProvider?.getTransferStatus
    ) {
      return transaction;
    }
    try {
      const status = await this.ngnProvider.getTransferStatus(transaction.providerReference);
      if (status === "successful") {
        const updated = await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.successful,
            providerStatus: TransactionStatus.successful,
            completedAt: new Date()
          }
        });
        return { ...transaction, ...updated };
      }
      if (status === "failed" && this.walletService) {
        await this.walletService.reverseTransaction(
          undefined,
          transaction.id,
          "NGN transfer reversed after provider status reconciliation"
        );
        return { ...transaction, status: TransactionStatus.reversed };
      }
    } catch {
      // Webhooks remain the primary source. A provider polling outage must not
      // prevent the customer from opening an existing transaction receipt.
    }
    return transaction;
  }
}
