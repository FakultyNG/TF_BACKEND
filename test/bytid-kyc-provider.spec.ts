import { ConfigService } from "@nestjs/config";
import { KycStatus } from "@prisma/client";
import { createHmac } from "crypto";
import { BytidKycProvider } from "../src/providers/bytid/bytid.service";
import { BytidWebhookService } from "../src/webhooks/bytid/bytid-webhook.service";

const config = (values: Record<string, string> = {}) => ({
  get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback)
}) as unknown as ConfigService;

describe("BytID KYC provider", () => {
  it("normalizes the public website URL to the BytID API base URL", () => {
    const service = new BytidKycProvider(config({
      BYTID_BASE_URL: "https://www.bytid.com/",
      BYTID_API_KEY: "uvk_test_123"
    }));

    expect(((service as never) as { http: { defaults: { baseURL: string } } }).http.defaults.baseURL)
      .toBe("https://api.bytid.com/v1");
  });

  it("returns the provider error code and request id from BytID error envelopes", async () => {
    const service = new BytidKycProvider(config({ BYTID_API_KEY: "uvk_test_123" }));
    jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
      success: false,
      error: {
        code: "insufficient_scope",
        message: "The API key cannot run identity checks.",
        details: { required_scope: "identity" }
      },
      request_id: "req_123"
    });

    await expect(service.verifyBvn("12345678901")).rejects.toMatchObject({
      code: "BYTID_VERIFICATION_FAILED",
      details: {
        providerCode: "insufficient_scope",
        requestId: "req_123",
        providerDetails: { required_scope: "identity" }
      }
    });
  });

  it("submits a server-side BVN lookup to the documented endpoint", async () => {
    const service = new BytidKycProvider(config({ BYTID_API_KEY: "uvk_test_123" }));
    const request = jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
      success: true,
      data: {
        id: "verify_bvn_1",
        status: "verified",
        id_number: "123*****901",
        data: {
          first_name: "ADAEZE",
          last_name: "OKAFOR",
          date_of_birth: "15-Jan-1990",
          phone_number: "08000000000"
        }
      }
    });

    await expect(service.verifyBvn("12345678901", "user_1", {
      firstName: "Adaeze",
      lastName: "Okafor",
      dateOfBirth: "15-01-1990",
      reference: "kyc_ref_1"
    })).resolves.toMatchObject({
      provider: "bytid",
      providerReference: "verify_bvn_1",
      bvnVerified: true,
      firstName: "ADAEZE",
      lastName: "OKAFOR",
      dateOfBirth: "1990-01-15"
    });
    expect(request).toHaveBeenCalledWith("post", "/identity/bvn", {
      id_number: "12345678901",
      first_name: "Adaeze",
      last_name: "Okafor",
      dob: "1990-01-15",
      reference: "kyc_ref_1"
    });
  });

  it("submits BVN face match with fetched BVN identity details", async () => {
    const service = new BytidKycProvider(config({
      BYTID_API_KEY: "uvk_test_123",
      BYTID_FACE_MATCH_THRESHOLD: "80"
    }));
    const request = jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
      success: true,
      data: {
        id: "verify_1",
        reference: "kyc_ref_1",
        status: "verified",
        id_number: "123*****901",
        field_matches: {
          first_name: true,
          last_name: true,
          date_of_birth: true
        },
        face_match: {
          status: "matched",
          score: 92,
          liveness: "not_checked"
        },
        data: {
          first_name: "ADAEZE",
          middle_name: "TEST",
          last_name: "OKAFOR",
          date_of_birth: "15-Jan-1990",
          phone_number: "08000000000",
          gender: "Female",
          nationality: "Nigerian"
        }
      },
      request_id: "req_1"
    });

    const result = await service.verifyBvnWithSelfie("12345678901", "aGVsbG8=", "registration:reg_1", {
      firstName: "Adaeze",
      lastName: "Okafor",
      dateOfBirth: "15-01-1990",
      reference: "kyc_ref_1"
    });

    expect(result).toMatchObject({
      provider: "bytid",
      providerReference: "verify_1",
      bvnMasked: "123*****901",
      bvnVerified: true,
      faceMatch: true,
      selfieVerified: true,
      confidenceScore: 92,
      firstName: "ADAEZE",
      lastName: "OKAFOR",
      dateOfBirth: "1990-01-15"
    });
    expect(request).toHaveBeenCalledWith(
      "post",
      "/identity/bvn/face-match",
      {
        id_number: "12345678901",
        first_name: "Adaeze",
        last_name: "Okafor",
        dob: "1990-01-15",
        reference: "kyc_ref_1",
        selfie_image: "aGVsbG8="
      }
    );
  });

  it("rejects low score matches below the configured threshold", async () => {
    const service = new BytidKycProvider(config({
      BYTID_API_KEY: "uvk_test_123",
      BYTID_FACE_MATCH_THRESHOLD: "95"
    }));
    jest.spyOn((service as never) as { request: jest.Mock }, "request").mockResolvedValue({
      success: true,
      data: {
        id: "verify_2",
        status: "verified",
        face_match: { status: "matched", score: 92 },
        data: {
          first_name: "ADAEZE",
          last_name: "OKAFOR",
          date_of_birth: "15-Jan-1990"
        }
      }
    });

    await expect(
      service.verifyBvnWithSelfie("12345678901", "aGVsbG8=", "user_1", { reference: "kyc_ref_2" })
    ).resolves.toMatchObject({
      faceMatch: false,
      selfieVerified: false,
      confidenceScore: 92
    });
  });

  it("maps live face-match permission errors to an actionable response", async () => {
    const service = new BytidKycProvider(config({ BYTID_API_KEY: "uvk_live_123" }));
    const http = ((service as never) as { http: { request: jest.Mock } }).http;
    jest.spyOn(http, "request").mockRejectedValue({
      isAxiosError: true,
      message: "Request failed with status code 403",
      response: {
        status: 403,
        data: {
          success: false,
          error: {
            code: "insufficient_scope",
            message: "The API key cannot run this check.",
            details: { required_scope: "identity:bvn_face_match" }
          },
          request_id: "req_scope_1"
        }
      }
    });

    await expect(
      service.verifyBvnWithSelfie("12345678901", "aGVsbG8=", "user_1", {
        reference: "kyc_ref_1:selfie:attempt1"
      })
    ).rejects.toMatchObject({
      code: "BYTID_INSUFFICIENT_SCOPE",
      message: "BytID API key is not permitted to run BVN face matching",
      details: {
        providerCode: "insufficient_scope",
        requestId: "req_scope_1",
        providerDetails: { required_scope: "identity:bvn_face_match" }
      }
    });
  });
});

describe("BytID webhooks", () => {
  it("verifies signed completion events and updates the matched KYC record", async () => {
    const payload = {
      id: "evt_1",
      type: "verification.completed",
      data: {
        id: "verify_1",
        reference: "kyc_ref_1",
        status: "verified",
        data: null
      }
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", "whsec_test").update(`${timestamp}.${raw.toString("utf8")}`).digest("hex");
    const prisma = {
      webhookLog: { findUnique: jest.fn() },
      kycRecord: {
        findFirst: jest.fn().mockResolvedValue({ id: "kyc_db_1", userId: "user_1", providerReference: "old_ref", metadata: {} }),
        update: jest.fn().mockResolvedValue({ id: "kyc_db_1" })
      },
      auditLog: { create: jest.fn() }
    };
    const wallet = {
      activateWallet: jest.fn().mockResolvedValue(undefined),
      createDva: jest.fn().mockResolvedValue({})
    };
    const cashDrop = {
      isEnabled: jest.fn().mockReturnValue(false),
      register: jest.fn()
    };
    const logs = {
      createReceived: jest.fn().mockResolvedValue({ id: "log_1" }),
      isProcessed: jest.fn().mockResolvedValue(false),
      recordProcessedKey: jest.fn().mockResolvedValue(true),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
      markIgnored: jest.fn(),
      markDuplicate: jest.fn(),
      notifyUser: jest.fn(),
      sanitize: jest.fn((value) => value),
      toJson: jest.fn((value) => value)
    };
    const service = new BytidWebhookService(
      prisma as never,
      wallet as never,
      cashDrop as never,
      logs as never,
      config({ BYTID_WEBHOOK_SECRET: "whsec_test" }) as never
    );

    await expect(
      service.receive(payload, {
        "bytid-signature": `t=${timestamp},v1=${signature}`,
        "bytid-event": "verification.completed",
        "bytid-event-id": "evt_1"
      }, raw)
    ).resolves.toEqual({ duplicate: false });

    expect(logs.createReceived).toHaveBeenCalledWith(
      "bytid",
      expect.objectContaining({ eventType: "verification.completed", providerReference: "evt_1", internalReference: "kyc_ref_1" }),
      payload,
      true
    );
    expect(prisma.kycRecord.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { providerReference: "verify_1" },
          { kycReference: "kyc_ref_1" }
        ]
      }
    });
    expect(prisma.kycRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "kyc_db_1" },
      data: expect.objectContaining({
        provider: "bytid",
        providerReference: "verify_1",
        status: KycStatus.verified,
        selfieVerified: true,
        faceMatch: true
      })
    }));
    expect(wallet.activateWallet).toHaveBeenCalledWith("user_1");
    expect(logs.markProcessed).toHaveBeenCalledWith("log_1", "bytid", expect.any(Object), "KycRecord", "kyc_db_1");
  });

  it("rejects invalid webhook signatures", async () => {
    const payload = { id: "evt_2", type: "verification.completed", data: { id: "verify_2", reference: "kyc_ref_2" } };
    const logs = {
      createReceived: jest.fn().mockResolvedValue({ id: "log_2" }),
      markFailed: jest.fn(),
      sanitize: jest.fn((value) => value),
      toJson: jest.fn((value) => value)
    };
    const service = new BytidWebhookService(
      {} as never,
      {} as never,
      {} as never,
      logs as never,
      config({ BYTID_WEBHOOK_SECRET: "whsec_test" }) as never
    );

    await expect(
      service.receive(payload, { "bytid-signature": "t=1,v1=bad" }, Buffer.from(JSON.stringify(payload)))
    ).rejects.toMatchObject({ code: "INVALID_BYTID_WEBHOOK_SIGNATURE" });
    expect(logs.markFailed).toHaveBeenCalledWith("log_2", "Invalid BytID webhook signature");
  });
});
