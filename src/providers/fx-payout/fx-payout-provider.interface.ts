export interface FxQuoteResult {
  payoutCurrency: "USD" | "CNY";
  payoutAmount: number;
  fxRate: number;
  providerFee: number;
  tfFee: number;
  totalNgnDebit: number;
  estimatedSettlementTime: string;
}

export interface FxPayoutResult {
  status: "processing" | "successful" | "failed";
  provider: string;
  providerReference: string;
  raw?: unknown;
}

export interface FxPayoutProviderService {
  quote(input: { payoutCurrency: "USD" | "CNY"; amount: number }): Promise<FxQuoteResult>;
  submitPayout(input: { reference: string; payoutCurrency: "USD" | "CNY"; payoutAmount: number; beneficiary: unknown }): Promise<FxPayoutResult>;
}
