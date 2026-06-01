import { HttpStatus, Injectable } from "@nestjs/common";
import { TransactionStatus, TransactionType } from "@prisma/client";
import { offset, pagination } from "../common/dto/pagination-query.dto";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../prisma/prisma.service";
import { TransactionQueryDto } from "./dto/transaction-query.dto";

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: { giftCardPurchase: true, supportTickets: { select: { id: true, status: true, subject: true } } }
    });
    if (!transaction) throw new ApiException("Transaction not found", "TRANSACTION_NOT_FOUND", HttpStatus.NOT_FOUND);
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
      description: transaction.description,
      narration: transaction.narration,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
      relatedDetails: this.safeRelatedDetails(transaction)
    };
  }

  private toListItem(transaction: { id: string; type: TransactionType; amount: number; currency: string; status: TransactionStatus; description: string | null; createdAt: Date }) {
    return {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      description: transaction.description,
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
    if (transaction.supportTickets?.length) {
      return { supportTickets: transaction.supportTickets };
    }
    return null;
  }
}
