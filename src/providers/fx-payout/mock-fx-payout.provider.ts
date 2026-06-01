import { Injectable } from "@nestjs/common";
import { FxPayoutProviderService, FxPayoutResult, FxQuoteResult } from "./fx-payout-provider.interface";

@Injectable()
export class MockFxPayoutProvider implements FxPayoutProviderService {
  async quote(input: { payoutCurrency: "USD" | "CNY"; amount: number }): Promise<FxQuoteResult> {
    const fxRate = input.payoutCurrency === "USD" ? 1650 : 230;
    const providerFee = input.payoutCurrency === "USD" ? 2500 : 3000;
    const tfFee = input.payoutCurrency === "USD" ? 1500 : 2500;
    return {
      payoutCurrency: input.payoutCurrency,
      payoutAmount: input.amount,
      fxRate,
      providerFee,
      tfFee,
      totalNgnDebit: input.amount * fxRate + providerFee + tfFee,
      estimatedSettlementTime: "1-3 business days"
    };
  }

  async submitPayout(input: { reference: string; payoutCurrency: "USD" | "CNY" }): Promise<FxPayoutResult> {
    return {
      status: "processing",
      providerReference: `mock_${input.payoutCurrency.toLowerCase()}_${input.reference}`,
      raw: { submitted: true }
    };
  }
}
