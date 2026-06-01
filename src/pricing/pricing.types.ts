export const FEE_CONFIG_KEYS = ["ngn_transfer", "usd_transfer", "cny_transfer", "gift_card"] as const;

export type FeeConfigKey = (typeof FEE_CONFIG_KEYS)[number];

export interface FixedFeeRule {
  mode: "fixed";
  fixedFee: number;
}

export interface PercentageFeeRule {
  mode: "percentage";
  percentageBps: number;
  minFee: number;
  maxFee: number;
}

export type FeeRule = FixedFeeRule | PercentageFeeRule;

export interface NgnTransferFeeConfig {
  fee: FeeRule;
}

export interface FxTransferFeeConfig {
  fxRate: number;
  providerFee: FeeRule;
  tfFee: FeeRule;
  estimatedSettlementTime: string;
}

export interface GiftCardFeeConfig {
  usdFxRate: number;
  cnyFxRate: number;
  fee: FeeRule;
}
