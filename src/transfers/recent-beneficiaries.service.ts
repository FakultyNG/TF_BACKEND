import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, TransactionType } from "@prisma/client";
import { createHash } from "crypto";
import { ApiException } from "../common/errors/api.exception";
import { offset, pagination } from "../common/dto/pagination-query.dto";
import { PrismaService } from "../prisma/prisma.service";
import { FxQuote, NgnQuote } from "./quote.types";
import { RecentBeneficiaryQueryDto } from "./dto/recent-beneficiary-query.dto";

@Injectable()
export class RecentBeneficiariesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, query: RecentBeneficiaryQueryDto) {
    return this.search(userId, query);
  }

  async search(userId: string, query: RecentBeneficiaryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.where(userId, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.recentBeneficiary.findMany({
        where,
        take: limit,
        skip: offset(page, limit),
        orderBy: { lastUsedAt: "desc" }
      }),
      this.prisma.recentBeneficiary.count({ where })
    ]);
    return { items, pagination: pagination(page, limit, total) };
  }

  async delete(userId: string, beneficiaryId: string) {
    const existing = await this.prisma.recentBeneficiary.findFirst({ where: { id: beneficiaryId, userId } });
    if (!existing) throw new ApiException("Recent beneficiary not found", "RECENT_BENEFICIARY_NOT_FOUND", HttpStatus.NOT_FOUND);
    await this.prisma.recentBeneficiary.delete({ where: { id: beneficiaryId } });
    return { deleted: true, beneficiaryId };
  }

  saveOrUpdateNgnBeneficiary(userId: string, quote: NgnQuote, transactionId?: string) {
    const dedupeKey = this.dedupeKey(userId, TransactionType.ngn_transfer, quote.accountNumber, quote.bankCode);
    return this.prisma.recentBeneficiary.upsert({
      where: { dedupeKey },
      create: {
        userId,
        type: TransactionType.ngn_transfer,
        displayName: quote.accountName,
        bankName: quote.bankName,
        bankCode: quote.bankCode,
        accountNumber: quote.accountNumber,
        accountName: quote.accountName,
        transactionId,
        dedupeKey,
        lastUsedAt: new Date()
      },
      update: {
        displayName: quote.accountName,
        bankName: quote.bankName,
        accountName: quote.accountName,
        transactionId,
        lastUsedAt: new Date()
      }
    });
  }

  saveOrUpdateSupplierBeneficiary(userId: string, type: TransactionType, quote: FxQuote, transactionId?: string) {
    const accountNumber = this.stringValue(quote.beneficiary.accountNumber) ?? this.stringValue(quote.beneficiary.unionpayCardNumber);
    const bankCode = this.stringValue(quote.beneficiary.bankCode) ?? this.stringValue(quote.beneficiary.routingNumber) ?? this.stringValue(quote.beneficiary.swiftCode);
    const bankName = this.stringValue(quote.beneficiary.bankName);
    const accountName = this.stringValue(quote.beneficiary.accountName) ?? this.stringValue(quote.beneficiary.recipientName) ?? quote.recipientName;
    const dedupeKey = this.dedupeKey(userId, type, accountNumber ?? accountName, bankCode ?? quote.payoutCurrency);
    return this.prisma.recentBeneficiary.upsert({
      where: { dedupeKey },
      create: {
        userId,
        type,
        displayName: accountName,
        bankName,
        bankCode,
        accountNumber,
        accountName,
        supplierName: accountName,
        supplierCountry: quote.recipientCountry,
        payoutCurrency: quote.payoutCurrency,
        beneficiaryJson: quote.beneficiary as Prisma.InputJsonValue,
        paymentReference: quote.paymentReference,
        transactionId,
        dedupeKey,
        lastUsedAt: new Date()
      },
      update: {
        displayName: accountName,
        bankName,
        bankCode,
        accountName,
        supplierName: accountName,
        supplierCountry: quote.recipientCountry,
        payoutCurrency: quote.payoutCurrency,
        beneficiaryJson: quote.beneficiary as Prisma.InputJsonValue,
        paymentReference: quote.paymentReference,
        transactionId,
        lastUsedAt: new Date()
      }
    });
  }

  private where(userId: string, query: RecentBeneficiaryQueryDto): Prisma.RecentBeneficiaryWhereInput {
    const q = query.q?.trim();
    return {
      userId,
      type: query.type,
      OR: q
        ? [
            { accountNumber: { contains: q, mode: "insensitive" } },
            { accountName: { contains: q, mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } },
            { bankName: { contains: q, mode: "insensitive" } },
            { supplierName: { contains: q, mode: "insensitive" } },
            { supplierCountry: { contains: q, mode: "insensitive" } }
          ]
        : undefined
    };
  }

  private dedupeKey(userId: string, type: TransactionType, accountNumberOrName?: string, bankCodeOrCurrency?: string) {
    const raw = [userId, type, accountNumberOrName ?? "unknown", bankCodeOrCurrency ?? "unknown"].join(":").toLowerCase();
    return createHash("sha256").update(raw).digest("hex");
  }

  private stringValue(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
}
