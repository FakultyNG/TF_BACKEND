import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  DvaStatus,
  LedgerEntryType,
  Prisma,
  TransactionStatus,
  TransactionType,
  WalletStatus
} from "@prisma/client";
import { v4 as uuid } from "uuid";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../prisma/prisma.service";
import { DvaProviderService } from "../providers/dva/dva-provider.interface";
import { DVA_PROVIDER } from "../providers/provider.tokens";

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DVA_PROVIDER) private readonly dvaProvider: DvaProviderService
  ) {}

  async getOrCreateWallet(userId: string, status: WalletStatus = WalletStatus.inactive) {
    const existing = await this.prisma.wallet.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.wallet.create({ data: { userId, status } });
  }

  async activateWallet(userId: string) {
    await this.prisma.$transaction([
      this.prisma.wallet.upsert({
        where: { userId },
        create: { userId, status: WalletStatus.active },
        update: { status: WalletStatus.active }
      }),
      this.prisma.user.update({ where: { id: userId }, data: { walletStatus: WalletStatus.active } })
    ]);
  }

  async createDva(userId: string, preferredBank = "auto") {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, kycRecords: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    if (!user) throw new ApiException("User not found", "USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (user.kycRecords[0]?.status !== "verified") {
      throw new ApiException("KYC verification required", "KYC_NOT_VERIFIED", HttpStatus.FORBIDDEN);
    }
    const activeDva = await this.prisma.dedicatedVirtualAccount.findFirst({
      where: { userId, status: DvaStatus.active }
    });
    if (activeDva) {
      return this.toDvaResponse(activeDva);
    }
    await this.activateWallet(userId);
    const result = await this.dvaProvider.createDedicatedVirtualAccount({
      userId,
      phoneNumber: user.phoneNumber,
      firstName: user.profile?.firstName,
      lastName: user.profile?.lastName,
      preferredBank
    });
    const dva = await this.prisma.dedicatedVirtualAccount.create({
      data: {
        userId,
        provider: result.provider,
        bankName: result.bankName,
        accountNumber: result.accountNumber,
        accountName: result.accountName,
        preferredBank,
        status: result.status,
        providerReference: result.providerReference,
        metadata: result.raw as Prisma.InputJsonValue
      }
    });
    await this.logProvider(result.provider, "create_dva", userId, result.providerReference, "successful", { preferredBank }, result.raw);
    return this.toDvaResponse(dva);
  }

  async recreateDva(adminId: string, userId: string) {
    await this.prisma.dedicatedVirtualAccount.updateMany({
      where: { userId, status: DvaStatus.active },
      data: { status: DvaStatus.inactive }
    });
    const data = await this.createDva(userId, "auto");
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: "admin",
        action: "ADMIN_DVA_RECREATED",
        entityType: "DedicatedVirtualAccount",
        metadata: { userId }
      }
    });
    return data;
  }

  async getDva(userId: string) {
    const dva = await this.prisma.dedicatedVirtualAccount.findFirst({ where: { userId, status: DvaStatus.active } });
    if (!dva) throw new ApiException("Dedicated virtual account not found", "DVA_NOT_FOUND", HttpStatus.NOT_FOUND);
    return this.toDvaResponse(dva);
  }

  async getBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return { balance: wallet.balance, currency: wallet.currency, status: wallet.status };
  }

  async getSummary(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    const inflow = await this.prisma.walletLedger.aggregate({
      where: { userId, entryType: LedgerEntryType.credit },
      _sum: { amount: true }
    });
    const outflow = await this.prisma.walletLedger.aggregate({
      where: { userId, entryType: LedgerEntryType.debit },
      _sum: { amount: true }
    });
    const pendingTransactions = await this.prisma.transaction.count({
      where: { userId, status: { in: [TransactionStatus.pending, TransactionStatus.processing] } }
    });
    return {
      balance: wallet.balance,
      currency: wallet.currency,
      totalInflow: inflow._sum.amount ?? 0,
      totalOutflow: outflow._sum.amount ?? 0,
      pendingTransactions
    };
  }

  async verifyFunding(userId: string, reference: string) {
    const existing = await this.prisma.transaction.findUnique({ where: { reference } });
    if (existing) {
      return { transactionId: existing.id, amount: existing.amount, currency: existing.currency, status: existing.status };
    }
    const funding = await this.dvaProvider.verifyFunding(reference);
    if (funding.status !== "successful") {
      throw new ApiException("Funding could not be verified", "FUNDING_NOT_SUCCESSFUL", HttpStatus.BAD_REQUEST);
    }
    const result = await this.creditWallet({
      userId,
      amount: funding.amount,
      type: TransactionType.wallet_funding,
      reference,
      description: "Wallet funding",
      provider: "mock_lync",
      providerReference: funding.providerReference,
      idempotencyKey: `funding:${reference}`,
      metadata: funding.raw as Prisma.InputJsonValue
    });
    await this.logProvider("mock_lync", "verify_funding", reference, funding.providerReference, funding.status, { reference }, funding.raw);
    return {
      transactionId: result.transaction.id,
      amount: result.transaction.amount,
      currency: result.transaction.currency,
      status: result.transaction.status
    };
  }

  async creditWallet(input: WalletMutationInput) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.ensureWalletTx(tx, input.userId, WalletStatus.active);
      const transaction = await tx.transaction.create({
        data: {
          userId: input.userId,
          type: input.type,
          status: input.status ?? TransactionStatus.successful,
          amount: input.amount,
          fee: input.fee ?? 0,
          totalDebit: input.amount + (input.fee ?? 0),
          currency: "NGN",
          reference: input.reference,
          provider: input.provider,
          providerReference: input.providerReference,
          description: input.description,
          narration: input.narration,
          idempotencyKey: input.idempotencyKey,
          metadata: input.metadata
        }
      });
      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + input.amount;
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter, status: WalletStatus.active }
      });
      const ledger = await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          userId: input.userId,
          transactionId: transaction.id,
          entryType: input.entryType ?? LedgerEntryType.credit,
          amount: input.amount,
          balanceBefore,
          balanceAfter,
          reference: input.reference,
          description: input.description,
          metadata: input.metadata
        }
      });
      await tx.user.update({ where: { id: input.userId }, data: { walletStatus: WalletStatus.active } });
      return { transaction, wallet: updatedWallet, ledger };
    });
  }

  async debitWallet(input: WalletMutationInput) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.ensureWalletTx(tx, input.userId, WalletStatus.active);
      if (wallet.balance < input.amount) {
        throw new ApiException("Insufficient wallet balance", "INSUFFICIENT_BALANCE", HttpStatus.BAD_REQUEST);
      }
      const transaction = await tx.transaction.create({
        data: {
          userId: input.userId,
          type: input.type,
          status: input.status ?? TransactionStatus.processing,
          amount: input.amount,
          fee: input.fee ?? 0,
          totalDebit: input.totalDebit ?? input.amount,
          currency: "NGN",
          payoutAmount: input.payoutAmount,
          payoutCurrency: input.payoutCurrency,
          reference: input.reference,
          provider: input.provider,
          providerReference: input.providerReference,
          description: input.description,
          narration: input.narration,
          idempotencyKey: input.idempotencyKey,
          metadata: input.metadata
        }
      });
      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore - input.amount;
      const updatedWallet = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });
      const ledger = await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          userId: input.userId,
          transactionId: transaction.id,
          entryType: input.entryType ?? LedgerEntryType.debit,
          amount: input.amount,
          balanceBefore,
          balanceAfter,
          reference: input.reference,
          description: input.description,
          metadata: input.metadata
        }
      });
      return { transaction, wallet: updatedWallet, ledger };
    });
  }

  async reverseTransaction(adminId: string | undefined, transactionId: string, reason: string) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!transaction) throw new ApiException("Transaction not found", "TRANSACTION_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (transaction.status === TransactionStatus.reversed) {
      throw new ApiException("Transaction already reversed", "TRANSACTION_ALREADY_REVERSED", HttpStatus.BAD_REQUEST);
    }
    const reversal = await this.creditWallet({
      userId: transaction.userId,
      amount: transaction.totalDebit,
      type: TransactionType.reversal,
      status: TransactionStatus.successful,
      reference: `rev_${uuid().replace(/-/g, "").slice(0, 16)}`,
      description: reason,
      idempotencyKey: `reverse:${transaction.id}`,
      entryType: LedgerEntryType.reversal,
      metadata: { originalTransactionId: transaction.id, reason } as Prisma.InputJsonObject
    });
    await this.prisma.transaction.update({ where: { id: transaction.id }, data: { status: TransactionStatus.reversed } });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: adminId ? "admin" : "system",
        action: "TRANSACTION_REVERSED",
        entityType: "Transaction",
        entityId: transactionId,
        metadata: { reversalTransactionId: reversal.transaction.id, reason }
      }
    });
    return reversal.transaction;
  }

  async adminAdjustWallet(adminId: string, userId: string, direction: "credit" | "debit", amount: number, reason: string) {
    const reference = `adj_${uuid().replace(/-/g, "").slice(0, 16)}`;
    const operation = direction === "credit" ? this.creditWallet.bind(this) : this.debitWallet.bind(this);
    const result = await operation({
      userId,
      amount,
      type: TransactionType.wallet_adjustment,
      status: TransactionStatus.successful,
      reference,
      description: reason,
      idempotencyKey: `adjust:${reference}`,
      entryType: LedgerEntryType.adjustment
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: "admin",
        action: "ADMIN_WALLET_ADJUSTED",
        entityType: "Wallet",
        entityId: result.wallet.id,
        metadata: { userId, direction, amount, reason }
      }
    });
    return result;
  }

  listDvas(params: { take: number; skip: number; search?: string; provider?: string; status?: DvaStatus }) {
    return this.prisma.dedicatedVirtualAccount.findMany({
      take: params.take,
      skip: params.skip,
      where: {
        provider: params.provider,
        status: params.status,
        OR: params.search
          ? [
              { accountNumber: { contains: params.search, mode: "insensitive" } },
              { accountName: { contains: params.search, mode: "insensitive" } },
              { bankName: { contains: params.search, mode: "insensitive" } }
            ]
          : undefined
      },
      orderBy: { createdAt: "desc" }
    });
  }

  getDvaById(id: string) {
    return this.prisma.dedicatedVirtualAccount.findUnique({ where: { id } });
  }

  getUserWallet(userId: string) {
    return this.prisma.wallet.findUnique({ where: { userId } });
  }

  getUserLedger(userId: string, take = 50, skip = 0) {
    return this.prisma.walletLedger.findMany({ where: { userId }, take, skip, orderBy: { createdAt: "desc" } });
  }

  listTransactions(params: { take: number; skip: number; type?: TransactionType; status?: TransactionStatus; userId?: string; currency?: string; dateFrom?: Date; dateTo?: Date }) {
    return this.prisma.transaction.findMany({
      take: params.take,
      skip: params.skip,
      where: {
        type: params.type,
        status: params.status,
        userId: params.userId,
        currency: params.currency,
        createdAt: params.dateFrom || params.dateTo ? { gte: params.dateFrom, lte: params.dateTo } : undefined
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async getTransaction(id: string, role?: string) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id }, include: { ledger: true, giftCardPurchase: true } });
    if (!transaction) return null;
    if (role === "SUPER_ADMIN" || role === "FINANCE") return transaction;
    const { metadata, providerReference, ...safe } = transaction;
    return safe;
  }

  updateTransactionProvider(id: string, providerReference: string, status?: TransactionStatus) {
    return this.prisma.transaction.update({ where: { id }, data: { providerReference, status } });
  }

  private async ensureWalletTx(tx: Prisma.TransactionClient, userId: string, status: WalletStatus) {
    return tx.wallet.upsert({
      where: { userId },
      create: { userId, status },
      update: {}
    });
  }

  async logProvider(provider: string, operation: string, requestReference: string, providerReference: string | undefined, status: string, requestPayload: unknown, responsePayload: unknown) {
    await this.prisma.providerLog.create({
      data: {
        provider,
        operation,
        requestReference,
        providerReference,
        status,
        requestPayload: requestPayload as Prisma.InputJsonValue,
        responsePayload: responsePayload as Prisma.InputJsonValue
      }
    });
  }

  private toDvaResponse(dva: { bankName: string; accountNumber: string; accountName: string; provider: string; status: string }) {
    return {
      bankName: dva.bankName,
      accountNumber: dva.accountNumber,
      accountName: dva.accountName,
      provider: dva.provider,
      status: dva.status
    };
  }
}

export interface WalletMutationInput {
  userId: string;
  amount: number;
  fee?: number;
  totalDebit?: number;
  type: TransactionType;
  status?: TransactionStatus;
  reference: string;
  provider?: string;
  providerReference?: string;
  description?: string;
  narration?: string;
  idempotencyKey?: string;
  entryType?: LedgerEntryType;
  payoutAmount?: number;
  payoutCurrency?: string;
  metadata?: Prisma.InputJsonValue;
}
