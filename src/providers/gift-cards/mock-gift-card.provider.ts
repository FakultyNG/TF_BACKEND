import { Injectable } from "@nestjs/common";
import { GiftCardOrderResult, GiftCardProviderProduct, GiftCardProviderService } from "./gift-card-provider.interface";

export const MOCK_GIFT_CARDS: GiftCardProviderProduct[] = [
  { id: "gift_reeplay_usd", name: "Reeplay Gift Card", currency: "USD", minAmount: 10, maxAmount: 2500 },
  { id: "gift_amazon_usd", name: "Amazon Gift Card", currency: "USD", minAmount: 10, maxAmount: 500 }
];

@Injectable()
export class MockGiftCardProvider implements GiftCardProviderService {
  async listProducts(): Promise<GiftCardProviderProduct[]> {
    return MOCK_GIFT_CARDS;
  }

  async createOrder(input: { reference: string; giftCardId: string; amount: number; currency: string; recipientEmail?: string }): Promise<GiftCardOrderResult> {
    return {
      status: "processing",
      providerReference: `mock_gift_${input.reference}`,
      redemptionCode: `MOCK-${input.reference.slice(-8).toUpperCase()}`,
      redemptionInstructions: "Redeem with the issuing merchant.",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      raw: { submitted: true }
    };
  }
}
