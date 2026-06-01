export interface GiftCardQuote {
  userId: string;
  giftCardId: string;
  giftCardName: string;
  amount: number;
  currency: string;
  totalNgnDebit: number;
  fee: number;
  expiresAt: string;
}
