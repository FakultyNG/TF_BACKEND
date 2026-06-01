export const NOTIFICATION_CATEGORIES = ["system", "transactions", "transaction", "update", "security", "support", "promotion", "app_update"] as const;
export const NOTIFICATION_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export const NOTIFICATION_TYPES = [
  "app_update",
  "wallet_funded",
  "wallet_funding",
  "wallet_debited",
  "transfer_success",
  "transfer_failed",
  "ngn_transfer",
  "usd_transfer",
  "cny_transfer",
  "processing",
  "kyc_update",
  "kyc_verified",
  "kyc_rejected",
  "support_reply",
  "security_alert",
  "promotion",
  "promotional"
] as const;
