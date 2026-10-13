import { ConfigService } from "@nestjs/config";
import { StrowalletService } from "../src/providers/strowallet/strowallet.service";
import { StrowalletWebhookService } from "../src/webhooks/strowallet/strowallet-webhook.service";

const config = (values: Record<string, string> = {}) => ({
  get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback)
}) as unknown as ConfigService;

describe("Strowallet provider", () => {
  it("creates Sterling virtual accounts with the configured webhook url", async () => {
    const service = new StrowalletService(config({
      STROWALLET_PUBLIC_KEY: "pk_test",
      STROWALLET_VIRTUAL_ACCOUNT_WEBHOOK_URL: "https://api.example.com/api/v1/webhooks/strowallet/virtual-account"
    }), {} as never);
    const request = jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
      data: {
        account_number: "1234567890",
        account_name: "TRANSFA JOHN DOE",
        bank_name: "Sterling Bank",
        customer_id: "cust_1",
        status: "active"
      }
    });

    const result = await service.createDedicatedVirtualAccount({
      userId: "user_1",
      phoneNumber: "08100000000",
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com"
    });

    expect(result).toMatchObject({
      provider: "strowallet",
      bankName: "Sterling Bank",
      accountNumber: "1234567890",
      providerReference: "cust_1",
      status: "active"
    });
    expect(request).toHaveBeenCalledWith("post", "/api/virtual-bank/sterling", expect.objectContaining({
      public_key: "pk_test",
      webhook_url: "https://api.example.com/api/v1/webhooks/strowallet/virtual-account"
    }), undefined);
  });

  it("submits NGN transfers with the name enquiry reference", async () => {
    const service = new StrowalletService(config({ STROWALLET_PUBLIC_KEY: "pk_test" }), {} as never);
    jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
      merchantTxRef: "STW123",
      status: "success"
    });

    const result = await service.submitTransfer({
      amount: 1000,
      accountNumber: "0123456789",
      bankCode: "044",
      narration: "TF Transfer",
      reference: "txn_1",
      nameEnquiryReference: "name_ref_1"
    });

    expect(result).toMatchObject({
      provider: "strowallet",
      providerReference: "STW123",
      status: "successful"
    });
  });

  it("fetches BVN details before verifying registration BVN with the OTP phone number", async () => {
    const service = new StrowalletService(config({ STROWALLET_PUBLIC_KEY: "pk_test" }), {} as never);
    const request = jest.spyOn((service as never) as { request: jest.Mock }, "request")
      .mockResolvedValueOnce({
        status: true,
        data: {
          first_name: "Ada",
          last_name: "Lovelace",
          dob: "1990-01-02",
          phone_number: "08000000000"
        }
      })
      .mockResolvedValueOnce({
        status: "success",
        reference: "bvn_ref_1"
      });

    const result = await service.verifyBvn("12345678901", "registration:reg_temp_123", {
      phoneNumber: "+2347057109319"
    });

    expect(result).toMatchObject({
      provider: "strowallet",
      providerReference: "bvn_ref_1",
      bvnVerified: true,
      firstName: "ADA",
      lastName: "LOVELACE",
      dateOfBirth: "02-01-1990",
      phoneNumber: "07057109319"
    });
    expect(request).toHaveBeenNthCalledWith(
      1,
      "get",
      "/api/kyc_getbvnadvance/",
      undefined,
      { public_key: "pk_test", number: "12345678901" }
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "post",
      "/api/kyc_bvn/",
      undefined,
      expect.objectContaining({
        public_key: "pk_test",
        number: "12345678901",
        firstName: "ADA",
        lastName: "LOVELACE",
        dateOfBirth: "02-01-1990",
        phoneNumber: "07057109319"
      })
    );
  });
});

describe("Strowallet webhooks", () => {
  it("credits the matched DVA owner from virtual-account webhooks", async () => {
    const prisma = {
      dedicatedVirtualAccount: {
        findFirst: jest.fn().mockResolvedValue({ userId: "user_1", accountNumber: "66212194" })
      },
      auditLog: { create: jest.fn() }
    };
    const wallet = {
      creditWallet: jest.fn().mockResolvedValue({ transaction: { id: "txn_1" } })
    };
    const logs = {
      createReceived: jest.fn().mockResolvedValue({ id: "log_1" }),
      isProcessed: jest.fn().mockResolvedValue(false),
      recordProcessedKey: jest.fn().mockResolvedValue(true),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
      markDuplicate: jest.fn(),
      markIgnored: jest.fn(),
      notifyUser: jest.fn(),
      sanitize: jest.fn((value) => value),
      toJson: jest.fn((value) => value)
    };
    const strowallet = { verifyVirtualAccountWebhook: jest.fn().mockResolvedValue(true) };
    const service = new StrowalletWebhookService(prisma as never, wallet as never, logs as never, strowallet as never);

    await service.receiveVirtualAccountCredit({
      sessionId: "1100282610121058548",
      accountNumber: "66212194",
      transactionAmount: 100,
      currency: "NGN"
    });

    expect(wallet.creditWallet).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      amount: 100,
      provider: "strowallet",
      providerReference: "1100282610121058548"
    }));
    expect(logs.markProcessed).toHaveBeenCalledWith("log_1", "strowallet", expect.any(Object), "Transaction", "txn_1");
  });
});
