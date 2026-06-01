export interface NgnQuote {
  userId: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  fee: number;
  totalDebit: number;
  currency: "NGN";
  narration?: string;
  expiresAt: string;
}

export interface FxQuote {
  userId: string;
  payoutCurrency: "USD" | "CNY";
  payoutAmount: number;
  purpose: string;
  recipientName: string;
  recipientCountry: string;
  paymentReference: string;
  beneficiary: Record<string, unknown>;
  fxRate: number;
  providerFee: number;
  tfFee: number;
  totalNgnDebit: number;
  estimatedSettlementTime: string;
  expiresAt: string;
}
