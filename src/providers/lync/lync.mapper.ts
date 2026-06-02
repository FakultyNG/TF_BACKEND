import { TransactionStatus } from "@prisma/client";
import { createHash } from "crypto";
import { Bank, BankAccountSuggestion, ResolvedAccount } from "../transfers/ngn-transfer-provider.interface";
import {
  LyncDvaInput,
  LyncDvaOutput,
  LyncFundingOutput,
  LyncFxPayoutInput,
  LyncFxQuoteInput,
  LyncFxQuoteOutput,
  LyncNgnTransferInput,
  LyncTransferOutput
} from "./lync.types";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Math.round(Number(value));
  }
  return undefined;
};

const normalizeTransferStatus = (value: unknown): LyncTransferOutput["status"] => {
  const status = String(value ?? "processing").toLowerCase();
  if (["success", "successful", "completed", "complete"].includes(status)) return TransactionStatus.successful;
  if (["failed", "failure", "declined", "rejected", "cancelled", "canceled"].includes(status)) return TransactionStatus.failed;
  return TransactionStatus.processing;
};

const normalizeDvaStatus = (value: unknown): LyncDvaOutput["status"] => {
  const status = String(value ?? "active").toLowerCase();
  if (["failed", "failure", "rejected"].includes(status)) return "failed";
  if (["inactive", "disabled", "closed"].includes(status)) return "inactive";
  return "active";
};

export class LyncMapper {
  toCreateDvaPayload(input: LyncDvaInput) {
    // TODO(lync): align this payload with the exact Lync dashboard/API schema before enabling live mode.
    return {
      customerReference: input.internalReference,
      userId: input.userId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phoneNumber: input.phoneNumber,
      bvn: input.bvn,
      dateOfBirth: input.dateOfBirth,
      preferredBank: input.preferredBank
    };
  }

  toNgnTransferPayload(input: LyncNgnTransferInput) {
    // TODO(lync): align this payload with the exact Lync payout/payment schema before enabling live mode.
    return {
      reference: input.reference,
      amount: input.amount,
      currency: "NGN",
      destination: {
        bankCode: input.bankCode,
        accountNumber: input.accountNumber
      },
      narration: input.narration
    };
  }

  toFxQuotePayload(input: LyncFxQuoteInput) {
    // TODO(lync): align this payload with the exact Lync quote/rate schema before enabling live mode.
    return {
      sourceCurrency: "NGN",
      payoutCurrency: input.payoutCurrency,
      payoutAmount: input.amount
    };
  }

  toFxPayoutPayload(input: LyncFxPayoutInput) {
    // TODO(lync): align this payload with the exact Lync global payment schema before enabling live mode.
    return {
      reference: input.reference,
      sourceCurrency: "NGN",
      payoutCurrency: input.payoutCurrency,
      payoutAmount: input.payoutAmount,
      beneficiary: input.beneficiary
    };
  }

  toDvaOutput(raw: unknown): LyncDvaOutput {
    const data = this.unwrap(raw);
    return {
      provider: "lync",
      providerReference: firstString(data.providerReference, data.id, data.reference, data.accountReference) ?? this.syntheticReference(data),
      bankName: firstString(data.bankName, data.bank, data.bank_name) ?? "Lync Bank",
      accountNumber: firstString(data.accountNumber, data.account_number, data.number) ?? "",
      accountName: firstString(data.accountName, data.account_name, data.name) ?? "TRANSFA USER",
      status: normalizeDvaStatus(data.status),
      raw
    };
  }

  toFundingOutput(reference: string, raw: unknown): LyncFundingOutput {
    const data = this.unwrap(raw);
    return {
      reference,
      amount: firstNumber(data.amount, data.amountNgn, data.amount_ngn) ?? 0,
      currency: "NGN",
      status: normalizeTransferStatus(data.status) === "successful" ? "successful" : normalizeTransferStatus(data.status) === "failed" ? "failed" : "pending",
      providerReference: firstString(data.providerReference, data.id, data.reference) ?? reference,
      raw
    };
  }

  toBanks(raw: unknown): Bank[] {
    const data = this.unwrapArray(raw);
    return data
      .map((item) => ({
        code: firstString(item.code, item.bankCode, item.bank_code) ?? "",
        name: firstString(item.name, item.bankName, item.bank_name) ?? ""
      }))
      .filter((bank) => bank.code && bank.name);
  }

  toResolvedAccount(bankCode: string, accountNumber: string, raw: unknown): ResolvedAccount {
    const data = this.unwrap(raw);
    return {
      accountName: firstString(data.accountName, data.account_name, data.name) ?? "",
      accountNumber: firstString(data.accountNumber, data.account_number) ?? accountNumber,
      bankCode: firstString(data.bankCode, data.bank_code) ?? bankCode,
      bankName: firstString(data.bankName, data.bank_name, data.bank) ?? ""
    };
  }

  toBankSuggestions(accountNumber: string, raw: unknown): BankAccountSuggestion[] {
    return this.unwrapArray(raw)
      .map((item) => ({
        ...this.toResolvedAccount(firstString(item.bankCode, item.bank_code) ?? "", accountNumber, item),
        confidence: firstNumber(item.confidence, item.confidenceScore, item.score) ?? 0
      }))
      .filter((item) => item.bankCode && item.accountName)
      .sort((left, right) => right.confidence - left.confidence);
  }

  toTransferOutput(raw: unknown): LyncTransferOutput {
    const data = this.unwrap(raw);
    return {
      status: normalizeTransferStatus(data.status),
      providerReference: firstString(data.providerReference, data.id, data.reference) ?? this.syntheticReference(data),
      raw
    };
  }

  toFxQuote(input: LyncFxQuoteInput, fallback: LyncFxQuoteOutput, raw: unknown): LyncFxQuoteOutput {
    const data = this.unwrap(raw);
    return {
      payoutCurrency: input.payoutCurrency,
      payoutAmount: firstNumber(data.payoutAmount, data.payout_amount, data.amount) ?? fallback.payoutAmount,
      fxRate: firstNumber(data.fxRate, data.fx_rate, data.rate) ?? fallback.fxRate,
      providerFee: firstNumber(data.providerFee, data.provider_fee) ?? fallback.providerFee,
      tfFee: firstNumber(data.tfFee, data.tf_fee) ?? fallback.tfFee,
      totalNgnDebit: firstNumber(data.totalNgnDebit, data.total_ngn_debit, data.totalDebit) ?? fallback.totalNgnDebit,
      estimatedSettlementTime:
        firstString(data.estimatedSettlementTime, data.estimated_settlement_time, data.settlementTime) ??
        fallback.estimatedSettlementTime,
      raw
    };
  }

  private unwrap(raw: unknown) {
    const record = asRecord(raw);
    return asRecord(record.data || record.result || record.payload || raw);
  }

  private unwrapArray(raw: unknown) {
    const record = asRecord(raw);
    const value = record.data || record.result || record.payload || raw;
    if (Array.isArray(value)) return value.map(asRecord);
    const nested = asRecord(value);
    const banks = nested.banks || nested.items || nested.results;
    return Array.isArray(banks) ? banks.map(asRecord) : [];
  }

  private syntheticReference(data: Record<string, unknown>) {
    return `lync_${createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16)}`;
  }
}
