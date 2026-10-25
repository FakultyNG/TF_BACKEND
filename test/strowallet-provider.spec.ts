import { ConfigService } from "@nestjs/config";
import { StrowalletService } from "../src/providers/strowallet/strowallet.service";
import { StrowalletWebhookService } from "../src/webhooks/strowallet/strowallet-webhook.service";

const config = (values: Record<string, string> = {}) => ({
  get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback)
}) as unknown as ConfigService;

describe("Strowallet provider", () => {
  it("loads and normalizes the live Strowallet bank list", async () => {
    const service = new StrowalletService(config({ STROWALLET_PUBLIC_KEY: "pk_live" }), {} as never);
    const request = jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
      data: {
        bank_list: [
          { bank_code: "044", bank_name: "Access Bank" },
          { BankCode: "058", BankName: "GTBank" }
        ]
      }
    });

    await expect(service.getBanks()).resolves.toEqual([
      { code: "044", name: "Access Bank" },
      { code: "058", name: "GTBank" }
    ]);
    expect(request).toHaveBeenCalledWith(
      "get",
      "/api/banks/lists/",
      undefined,
      { public_key: "pk_live" }
    );
  });

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
      email: "john@example.com",
      preferredBank: "sterling"
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

  it("uses the default live endpoint for auto DVA creation and derives a unique valid email", async () => {
    const service = new StrowalletService(config({
      STROWALLET_PUBLIC_KEY: "pk_live",
      STROWALLET_VIRTUAL_ACCOUNT_WEBHOOK_URL: "https://api.example.com/api/v1/webhooks/strowallet/virtual-account"
    }), {} as never);
    const request = jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
      data: {
        account_number: "1234567890",
        account_name: "TRANSFA JOHN DOE",
        bank_name: "Nombank MFB",
        customer_id: "cust_1",
        status: "active"
      }
    });

    await service.createDedicatedVirtualAccount({
      userId: "user_123",
      phoneNumber: "+2348100000000",
      firstName: "John",
      lastName: "Doe",
      preferredBank: "auto"
    });

    expect(request).toHaveBeenCalledWith("post", "/api/virtual-bank/new-customer/", expect.objectContaining({
      email: "transfa.user123@customers.transfaintel.xyz",
      phone: "08100000000",
      mode: "live"
    }), undefined);
  });

  it("submits NGN transfers with the name enquiry reference", async () => {
    const service = new StrowalletService(config({ STROWALLET_PUBLIC_KEY: "pk_test" }), {} as never);
    const request = jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
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
    expect(request).toHaveBeenCalledWith("post", "/api/banks/request/", undefined, {
      public_key: "pk_test",
      amount: "1000",
      bank_code: "044",
      account_number: "0123456789",
      narration: "TF Transfer",
      name_enquiry_reference: "name_ref_1",
      SenderName: "Transfa",
      mode: "live"
    });
  });

  it("normalizes alternate Strowallet name-enquiry reference keys", async () => {
    const service = new StrowalletService(config({ STROWALLET_PUBLIC_KEY: "pk_test" }), {} as never);
    jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
      data: {
        account_name: "ADA LOVELACE",
        bank_name: "Access Bank",
        session_id: "name_ref_2"
      }
    });

    await expect(service.resolveAccount("044", "0123456789")).resolves.toMatchObject({
      accountName: "ADA LOVELACE",
      providerReference: "name_ref_2"
    });
  });

  it("does not submit a transfer without Strowallet's required name-enquiry reference", async () => {
    const service = new StrowalletService(config({ STROWALLET_PUBLIC_KEY: "pk_test" }), {} as never);
    const request = jest.spyOn((service as never) as { request: jest.Mock }, "request");

    await expect(service.submitTransfer({
      amount: 1000,
      accountNumber: "0123456789",
      bankCode: "044",
      reference: "txn_1"
    })).rejects.toMatchObject({ code: "STROWALLET_NAME_ENQUIRY_REFERENCE_MISSING" });
    expect(request).not.toHaveBeenCalled();
  });

  it("returns an actionable error when Strowallet rejects the transfer", async () => {
    const service = new StrowalletService(config({ STROWALLET_PUBLIC_KEY: "pk_test" }), {} as never);
    jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
      success: false,
      error: { message: "Insufficient wallet balance" }
    });

    await expect(service.submitTransfer({
      amount: 1000,
      accountNumber: "0123456789",
      bankCode: "044",
      reference: "txn_1",
      nameEnquiryReference: "name_ref_1"
    })).rejects.toMatchObject({
      code: "STROWALLET_TRANSFER_REJECTED",
      message: "Strowallet payout balance is insufficient; fund the live Strowallet account and try again"
    });
  });

  it("uses the live BVN details endpoint and returns the identity needed for selfie verification", async () => {
    const service = new StrowalletService(config({ STROWALLET_PUBLIC_KEY: " pk_live " }), {} as never);
    const request = jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
      success: true,
      message: "BVN details retrieved successfully",
      data: {
        reference: "bvn_ref_1",
        first_name: "ADA",
        middle_name: "BYRON",
        last_name: "LOVELACE",
        date_of_birth: "02-Jan-1990",
        phone_number: "08000000000",
        gender: "Female"
      }
    });

    const result = await service.verifyBvn("12345678901", "registration:reg_temp_123", {
      phoneNumber: "+2347057109319"
    });

    expect(result).toMatchObject({
      provider: "strowallet",
      providerReference: "bvn_ref_1",
      bvnVerified: true,
      firstName: "ADA",
      middleName: "BYRON",
      lastName: "LOVELACE",
      dateOfBirth: "02-Jan-1990",
      phoneNumber: "08000000000",
      gender: "Female"
    });
    expect(request).toHaveBeenCalledWith(
      "get",
      "/api/kyc_getbvn/",
      undefined,
      { public_key: "pk_live", number: "12345678901" }
    );
  });

  it("rejects a Strowallet response that does not contain verified identity details", async () => {
    const service = new StrowalletService(config({ STROWALLET_PUBLIC_KEY: "pk_live" }), {} as never);
    jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
      success: false,
      message: "Invalid Public Key"
    });

    await expect(service.verifyBvn("12345678901")).rejects.toMatchObject({
      code: "STROWALLET_BVN_LOOKUP_FAILED"
    });
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
      assessIncomingCredit: jest.fn().mockResolvedValue({ allowed: true, currentTier: "citizen" }),
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
