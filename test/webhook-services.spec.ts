import { createHmac } from "crypto";
import { TransactionStatus, TransactionType } from "@prisma/client";
import { WebhookSignatureService } from "../src/webhooks/common/webhook-signature.service";
import { LyncWebhookService } from "../src/webhooks/lync/lync-webhook.service";
import { PayoutProviderWebhookService } from "../src/webhooks/payout-provider/payout-provider-webhook.service";
import { GiftCardProviderWebhookService } from "../src/webhooks/gift-card-provider/gift-card-provider-webhook.service";
import { SendchampWebhookService } from "../src/webhooks/sendchamp/sendchamp-webhook.service";

describe("webhook infrastructure", () => {
  it("verifies provider HMAC signatures", () => {
    const service = new WebhookSignatureService({ get: jest.fn() } as never);
    const payload = { event: "wallet_funding.successful", providerReference: "ref_1" };
    const signature = createHmac("sha256", "secret").update(JSON.stringify(payload)).digest("hex");

    expect(service.verify(payload, { "x-signature": signature }, "secret")).toBe(true);
    expect(service.verify(payload, { "x-signature": "bad" }, "secret")).toBe(false);
  });

  it("rejects invalid Lync signatures before crediting wallet", async () => {
    const logs = {
      createReceived: jest.fn().mockResolvedValue({ id: "log_1" }),
      markFailed: jest.fn()
    };
    const signatures = { verify: jest.fn().mockReturnValue(false), secret: jest.fn().mockReturnValue("secret") };
    const wallet = { creditWallet: jest.fn() };
    const service = new LyncWebhookService({} as never, wallet as never, logs as never, signatures as never);

    await expect(service.receive({ event: "wallet_funding.successful" }, {})).rejects.toMatchObject({
      code: "INVALID_WEBHOOK_SIGNATURE"
    });
    expect(wallet.creditWallet).not.toHaveBeenCalled();
  });

  it("ignores duplicate funding webhooks without a second wallet credit", async () => {
    const logs = {
      createReceived: jest.fn().mockResolvedValue({ id: "log_1" }),
      isProcessed: jest.fn().mockResolvedValue(true),
      markDuplicate: jest.fn()
    };
    const signatures = { verify: jest.fn().mockReturnValue(true), secret: jest.fn().mockReturnValue("secret") };
    const wallet = { creditWallet: jest.fn() };
    const service = new LyncWebhookService({} as never, wallet as never, logs as never, signatures as never);

    await expect(service.receive({ event: "wallet_funding.successful", providerReference: "ref_1", amount: 1000 }, {})).resolves.toEqual({
      duplicate: true
    });
    expect(wallet.creditWallet).not.toHaveBeenCalled();
    expect(logs.markDuplicate).toHaveBeenCalledWith("log_1");
  });

  it("failed payout webhook reverses the wallet debit once", async () => {
    const transaction = {
      id: "txn_1",
      userId: "user_1",
      type: TransactionType.usd_transfer,
      status: TransactionStatus.processing,
      providerReference: "payout_ref_1"
    };
    const prisma = {
      transaction: { findFirst: jest.fn().mockResolvedValue(transaction) },
      auditLog: { create: jest.fn() }
    };
    const wallet = { reverseTransaction: jest.fn().mockResolvedValue({ id: "rev_1" }) };
    const logs = {
      createReceived: jest.fn().mockResolvedValue({ id: "log_1" }),
      isProcessed: jest.fn().mockResolvedValue(false),
      recordProcessedKey: jest.fn().mockResolvedValue(true),
      markProcessed: jest.fn(),
      markDuplicate: jest.fn(),
      markFailed: jest.fn(),
      markIgnored: jest.fn(),
      notifyUser: jest.fn()
    };
    const signatures = { verify: jest.fn().mockReturnValue(true), secret: jest.fn().mockReturnValue("secret") };
    const service = new PayoutProviderWebhookService(prisma as never, wallet as never, logs as never, signatures as never);

    await service.receive({ event: "payout.failed", status: "failed", providerReference: "payout_ref_1" }, {});
    expect(wallet.reverseTransaction).toHaveBeenCalledTimes(1);

    logs.isProcessed.mockResolvedValueOnce(true);
    await expect(service.receive({ event: "payout.failed", status: "failed", providerReference: "payout_ref_1" }, {})).resolves.toEqual({
      duplicate: true
    });
    expect(wallet.reverseTransaction).toHaveBeenCalledTimes(1);
  });

  it("gift card delivered webhook updates purchase and transaction only with safe metadata", async () => {
    const purchase = {
      id: "purchase_1",
      userId: "user_1",
      transactionId: "txn_1",
      providerReference: "gc_ref_1",
      transaction: { id: "txn_1", status: TransactionStatus.processing }
    };
    const prisma = {
      giftCardPurchase: { findFirst: jest.fn().mockResolvedValue(purchase), update: jest.fn() },
      transaction: { update: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.resolve(ops)),
      auditLog: { create: jest.fn() }
    };
    const logs = {
      createReceived: jest.fn().mockResolvedValue({ id: "log_1" }),
      isProcessed: jest.fn().mockResolvedValue(false),
      recordProcessedKey: jest.fn().mockResolvedValue(true),
      markProcessed: jest.fn(),
      markDuplicate: jest.fn(),
      markFailed: jest.fn(),
      markIgnored: jest.fn(),
      notifyUser: jest.fn(),
      sanitize: jest.fn((value: unknown) => value),
      toJson: jest.fn((value: unknown) => value)
    };
    const signatures = { verify: jest.fn().mockReturnValue(true), secret: jest.fn().mockReturnValue("secret") };
    const service = new GiftCardProviderWebhookService(prisma as never, { reverseTransaction: jest.fn() } as never, logs as never, signatures as never);

    await service.receive({ event: "gift_card.delivered", status: "delivered", providerReference: "gc_ref_1", code: "secret-code" }, {});

    expect(prisma.giftCardPurchase.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "purchase_1" } }));
    expect(prisma.transaction.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "txn_1" } }));
  });

  it("logs Sendchamp delivery events without touching OTP auth state", async () => {
    const logs = {
      createReceived: jest.fn().mockResolvedValue({ id: "log_1" }),
      isProcessed: jest.fn().mockResolvedValue(false),
      recordProcessedKey: jest.fn().mockResolvedValue(true),
      markProcessed: jest.fn(),
      markDuplicate: jest.fn(),
      markFailed: jest.fn()
    };
    const signatures = { verify: jest.fn().mockReturnValue(true), secret: jest.fn().mockReturnValue("secret") };
    const service = new SendchampWebhookService({ auditLog: { create: jest.fn() } } as never, logs as never, signatures as never);

    await expect(service.receive({ event: "sms.delivered", status: "delivered", reference: "sendchamp_ref_1", code: "123456" }, {})).resolves.toEqual({
      duplicate: false
    });

    expect(signatures.secret).toHaveBeenCalledWith("SENDCHAMP_WEBHOOK_SECRET");
    expect(logs.createReceived).toHaveBeenCalledWith(
      "sendchamp",
      expect.objectContaining({ eventType: "sms.delivered", providerReference: "sendchamp_ref_1", status: TransactionStatus.successful }),
      expect.any(Object),
      true
    );
    expect(logs.markProcessed).toHaveBeenCalledWith("log_1", "sendchamp", expect.any(Object), "OtpDelivery", "sendchamp_ref_1");
  });

  it("deduplicates Sendchamp delivery webhooks", async () => {
    const logs = {
      createReceived: jest.fn().mockResolvedValue({ id: "log_1" }),
      isProcessed: jest.fn().mockResolvedValue(true),
      markDuplicate: jest.fn()
    };
    const signatures = { verify: jest.fn().mockReturnValue(true), secret: jest.fn().mockReturnValue("secret") };
    const service = new SendchampWebhookService({} as never, logs as never, signatures as never);

    await expect(service.receive({ event: "sms.delivered", reference: "sendchamp_ref_1" }, {})).resolves.toEqual({
      duplicate: true
    });
    expect(logs.markDuplicate).toHaveBeenCalledWith("log_1");
  });

  it("rejects invalid Sendchamp webhook signatures", async () => {
    const logs = {
      createReceived: jest.fn().mockResolvedValue({ id: "log_1" }),
      markFailed: jest.fn()
    };
    const signatures = { verify: jest.fn().mockReturnValue(false), secret: jest.fn().mockReturnValue("secret") };
    const service = new SendchampWebhookService({} as never, logs as never, signatures as never);

    await expect(service.receive({ event: "sms.delivered", reference: "sendchamp_ref_1" }, {})).rejects.toMatchObject({
      code: "INVALID_WEBHOOK_SIGNATURE"
    });
    expect(logs.markFailed).toHaveBeenCalledWith("log_1", "Invalid webhook signature");
  });
});
