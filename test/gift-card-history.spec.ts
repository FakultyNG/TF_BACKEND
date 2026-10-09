import { GiftCardPurchaseStatus } from "@prisma/client";
import { GiftCardCodeCipher } from "../src/gift-cards/gift-card-code-cipher.service";
import { GiftCardsService } from "../src/gift-cards/gift-cards.service";

const config = {
  get: (key: string) =>
    key === "GIFT_CARD_ENCRYPTION_KEY"
      ? "test-gift-card-encryption-key-with-more-than-32-characters"
      : undefined
};

describe("gift-card purchase history", () => {
  it("encrypts redemption codes and can safely mask them", () => {
    const cipher = new GiftCardCodeCipher(config as never);
    const encrypted = cipher.encrypt("AMZN-ABCD-EFGH-4821");

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain("AMZN-ABCD");
    expect(cipher.decrypt(encrypted)).toBe("AMZN-ABCD-EFGH-4821");
    expect(cipher.mask(cipher.decrypt(encrypted))).toBe("****-****-4821");
  });

  it("lists only the authenticated user's purchases", async () => {
    const cipher = new GiftCardCodeCipher(config as never);
    const purchase = {
      id: "gift_purchase_1",
      userId: "user_1",
      transactionId: "txn_gift_1",
      giftCardId: "gift_1",
      giftCardName: "Reeplay Gift Card",
      amount: 50,
      currency: "USD",
      status: GiftCardPurchaseStatus.delivered,
      recipientEmail: null,
      provider: "mock",
      providerReference: "provider_1",
      redemptionCode: cipher.encrypt("CODE-4821"),
      redemptionInstructions: "Redeem with the issuing merchant.",
      deliveredAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      transaction: { totalDebit: 85000, fee: 1000 },
      product: { imageUrl: null }
    };
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([[purchase], 1]),
      giftCardPurchase: {
        findMany: jest.fn(),
        count: jest.fn()
      }
    };
    const service = new GiftCardsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      cipher,
      {} as never
    );

    const result = await service.listUserPurchases("user_1", {
      page: 1,
      limit: 20,
      status: GiftCardPurchaseStatus.delivered
    });

    expect(prisma.giftCardPurchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user_1",
          status: GiftCardPurchaseStatus.delivered
        }
      })
    );
    expect(result.items[0]).toMatchObject({
      purchaseId: "gift_purchase_1",
      transactionId: "txn_gift_1",
      redemptionCode: undefined,
      redemptionCodeMasked: "****-****-4821"
    });
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1
    });
  });

  it("returns a full code only from an owned delivered purchase detail", async () => {
    const cipher = new GiftCardCodeCipher(config as never);
    const prisma = {
      giftCardPurchase: {
        findFirst: jest.fn().mockResolvedValue({
          id: "gift_purchase_1",
          userId: "user_1",
          transactionId: "txn_gift_1",
          giftCardId: "gift_1",
          giftCardName: "Reeplay Gift Card",
          amount: 50,
          currency: "USD",
          status: GiftCardPurchaseStatus.delivered,
          recipientEmail: null,
          provider: "mock",
          providerReference: "provider_1",
          redemptionCode: cipher.encrypt("CODE-4821"),
          redemptionInstructions: null,
          deliveredAt: new Date(),
          expiresAt: null,
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          transaction: { totalDebit: 85000, fee: 1000 },
          product: { imageUrl: null }
        })
      }
    };
    const service = new GiftCardsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      cipher,
      {} as never
    );

    await expect(service.getDetails("user_1", "gift_purchase_1")).resolves.toMatchObject({
      purchaseId: "gift_purchase_1",
      redemptionCode: "CODE-4821"
    });
    expect(prisma.giftCardPurchase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user_1",
          OR: [{ id: "gift_purchase_1" }, { transactionId: "gift_purchase_1" }]
        }
      })
    );
  });
});
