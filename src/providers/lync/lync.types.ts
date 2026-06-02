import { Bank, BankAccountSuggestion, ResolvedAccount } from "../transfers/ngn-transfer-provider.interface";

export type LyncTransferStatus = "processing" | "successful" | "failed";
export type LyncDvaStatus = "active" | "inactive" | "failed";

export interface LyncConfig {
  enabled: boolean;
  env: string;
  baseUrl?: string;
  apiKey?: string;
  secretKey?: string;
  clientId?: string;
  clientSecret?: string;
  timeoutMs: number;
  paths: Partial<Record<LyncEndpointKey, string>>;
}

export type LyncEndpointKey =
  | "createDva"
  | "getDva"
  | "verifyFunding"
  | "banks"
  | "resolveAccount"
  | "ngnTransfer"
  | "fxQuote"
  | "fxPayout"
  | "receipt";

export interface LyncDvaInput {
  userId: string;
  phoneNumber: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  bvn?: string | null;
  dateOfBirth?: Date | string | null;
  preferredBank?: string;
  internalReference: string;
}

export interface LyncDvaOutput {
  provider: string;
  providerReference: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  status: LyncDvaStatus;
  raw?: unknown;
}

export interface LyncFundingOutput {
  reference: string;
  amount: number;
  currency: "NGN";
  status: "successful" | "failed" | "pending";
  providerReference: string;
  raw?: unknown;
}

export interface LyncNgnTransferInput {
  amount: number;
  accountNumber: string;
  bankCode: string;
  narration?: string;
  reference: string;
}

export interface LyncTransferOutput {
  status: LyncTransferStatus;
  providerReference: string;
  raw?: unknown;
}

export interface LyncFxQuoteInput {
  payoutCurrency: "USD" | "CNY";
  amount: number;
}

export interface LyncFxQuoteOutput {
  payoutCurrency: "USD" | "CNY";
  payoutAmount: number;
  fxRate: number;
  providerFee: number;
  tfFee: number;
  totalNgnDebit: number;
  estimatedSettlementTime: string;
  raw?: unknown;
}

export interface LyncFxPayoutInput {
  reference: string;
  payoutCurrency: "USD" | "CNY";
  payoutAmount: number;
  beneficiary: unknown;
}

export interface LyncProviderPort {
  createDedicatedVirtualAccount(input: LyncDvaInput): Promise<LyncDvaOutput>;
  getDedicatedVirtualAccount(input: { providerReference: string }): Promise<LyncDvaOutput>;
  verifyFunding(reference: string): Promise<LyncFundingOutput>;
  getBanks(): Promise<Bank[]>;
  suggestBanksByAccountNumber(accountNumber: string): Promise<BankAccountSuggestion[]>;
  resolveAccount(bankCode: string, accountNumber: string): Promise<ResolvedAccount>;
  submitNgnTransfer(input: LyncNgnTransferInput): Promise<LyncTransferOutput>;
  quoteFx(input: LyncFxQuoteInput): Promise<LyncFxQuoteOutput>;
  submitFxPayout(input: LyncFxPayoutInput): Promise<LyncTransferOutput>;
  getPaymentReceipt(input: { providerReference: string }): Promise<unknown>;
}
