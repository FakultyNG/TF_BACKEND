import { MockDvaProvider } from "../src/providers/dva/mock-dva.provider";
import { MockFxPayoutProvider } from "../src/providers/fx-payout/mock-fx-payout.provider";
import { MockGiftCardProvider } from "../src/providers/gift-cards/mock-gift-card.provider";
import { MockNgnTransferProvider } from "../src/providers/transfers/mock-ngn-transfer.provider";

describe("mock provider adapters", () => {
  it("creates deterministic DVA details and verifies mock funding", async () => {
    const provider = new MockDvaProvider();

    const first = await provider.createDedicatedVirtualAccount({
      userId: "user_123",
      phoneNumber: "2348000000000",
      firstName: "Ada",
      lastName: "Okafor"
    });
    const second = await provider.createDedicatedVirtualAccount({
      userId: "user_123",
      phoneNumber: "2348000000000",
      firstName: "Ada",
      lastName: "Okafor"
    });
    const funding = await provider.verifyFunding("mock_fund_001");

    expect(first.accountNumber).toMatch(/^\d{10}$/);
    expect(first.accountNumber).toBe(second.accountNumber);
    expect(first.provider).toBe("mock_lync");
    expect(funding).toMatchObject({
      amount: 50000,
      currency: "NGN",
      status: "successful"
    });
  });

  it("returns mock NGN banks, account resolution, and processing transfer status", async () => {
    const provider = new MockNgnTransferProvider();

    const banks = await provider.getBanks();
    const suggestions = await provider.suggestBanksByAccountNumber("0123456789");
    const resolved = await provider.resolveAccount("058", "0123456789");
    const submitted = await provider.submitTransfer({ reference: "txn_ngn_test" });

    expect(banks.length).toBeGreaterThan(0);
    expect(suggestions).toEqual([
      {
        accountName: "JOHN DOE",
        accountNumber: "0123456789",
        bankCode: "044",
        bankName: "Access Bank",
        confidence: 95
      },
      {
        accountName: "JOHN DOE",
        accountNumber: "0123456789",
        bankCode: "058",
        bankName: "GTBank",
        confidence: 88
      },
      {
        accountName: "JOHN DOE",
        accountNumber: "0123456789",
        bankCode: "035",
        bankName: "Wema Bank",
        confidence: 80
      }
    ]);
    expect(resolved).toMatchObject({
      accountName: "JOHN DOE",
      accountNumber: "0123456789",
      bankCode: "058",
      bankName: "GTBank"
    });
    expect(submitted.status).toBe("processing");
  });

  it("calculates USD and CNY mock FX payout quotes", async () => {
    const provider = new MockFxPayoutProvider();

    const usd = await provider.quote({ payoutCurrency: "USD", amount: 100 });
    const cny = await provider.quote({ payoutCurrency: "CNY", amount: 100 });

    expect(usd).toMatchObject({
      payoutCurrency: "USD",
      payoutAmount: 100,
      fxRate: 1650,
      totalNgnDebit: 169000
    });
    expect(cny).toMatchObject({
      payoutCurrency: "CNY",
      payoutAmount: 100,
      fxRate: 230,
      totalNgnDebit: 28500
    });
  });

  it("lists and submits mock gift card orders", async () => {
    const provider = new MockGiftCardProvider();

    const products = await provider.listProducts();
    const order = await provider.createOrder({
      reference: "txn_gift_abcdef12",
      giftCardId: "gift_reeplay_usd",
      amount: 50,
      currency: "USD",
      recipientEmail: "buyer@example.com"
    });

    expect(products.map((item) => item.id)).toContain("gift_reeplay_usd");
    expect(order).toMatchObject({
      status: "processing",
      providerReference: "mock_gift_txn_gift_abcdef12",
      redemptionCode: "MOCK-ABCDEF12"
    });
  });
});
