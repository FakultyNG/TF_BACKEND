import { ConfigService } from "@nestjs/config";
import { BytidKycProvider } from "../src/providers/bytid/bytid.service";

const config = (values: Record<string, string> = {}) => ({
  get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback)
}) as unknown as ConfigService;

describe("BytID KYC provider", () => {
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
        data: {}
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
});
