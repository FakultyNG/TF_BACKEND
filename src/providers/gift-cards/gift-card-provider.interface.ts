export interface GiftCardProviderProduct {
  id: string;
  name: string;
  currency: string;
  minAmount: number;
  maxAmount: number;
}

export interface GiftCardOrderResult {
  status: "processing" | "delivered" | "failed";
  providerReference: string;
  redemptionCode?: string;
  raw?: unknown;
}

export interface GiftCardProviderService {
  listProducts(): Promise<GiftCardProviderProduct[]>;
  createOrder(input: { reference: string; giftCardId: string; amount: number; currency: string; recipientEmail?: string }): Promise<GiftCardOrderResult>;
}
