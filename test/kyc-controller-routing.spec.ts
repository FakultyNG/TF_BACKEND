import { KycController } from "../src/kyc/kyc.controller";

describe("KycController routing", () => {
  it("uses registrationToken on /kyc/bvn/verify for pre-registration KYC", async () => {
    const kycService = { verifyBvn: jest.fn() };
    const authService = {
      verifyRegistrationBvn: jest.fn().mockResolvedValue({
        kycReference: "kyc_ref_123",
        bvnVerified: true
      })
    };
    const controller = new KycController(kycService as never, authService as never, {} as never);

    await expect(
      controller.verifyBvn({ registrationToken: "reg_temp_123", bvn: "12345678901" }, undefined)
    ).resolves.toMatchObject({
      success: true,
      message: "BVN verified successfully",
      data: { kycReference: "kyc_ref_123", bvnVerified: true }
    });

    expect(authService.verifyRegistrationBvn).toHaveBeenCalledWith("reg_temp_123", "12345678901");
    expect(kycService.verifyBvn).not.toHaveBeenCalled();
  });

  it("uses registrationToken on /kyc/bvn/selfie-validate for pre-registration selfie validation", async () => {
    const kycService = { validateSelfie: jest.fn() };
    const authService = {
      validateRegistrationSelfie: jest.fn().mockResolvedValue({
        kycStatus: "verified",
        faceMatch: true
      })
    };
    const controller = new KycController(kycService as never, authService as never, {} as never);

    await expect(
      controller.selfie(
        {
          registrationToken: "reg_temp_123",
          kycReference: "kyc_ref_123",
          selfieImageBase64: "data:image/jpeg;base64,aGVsbG8="
        },
        undefined
      )
    ).resolves.toMatchObject({
      success: true,
      message: "Selfie validation successful",
      data: { kycStatus: "verified", faceMatch: true }
    });

    expect(authService.validateRegistrationSelfie).toHaveBeenCalledWith(
      "reg_temp_123",
      "kyc_ref_123",
      "data:image/jpeg;base64,aGVsbG8="
    );
    expect(kycService.validateSelfie).not.toHaveBeenCalled();
  });

  it("keeps legacy authenticated BVN verification when registrationToken is omitted", async () => {
    const kycService = {
      verifyBvn: jest.fn().mockResolvedValue({ kycReference: "kyc_ref_auth", bvnVerified: true })
    };
    const authService = {
      validateAccessToken: jest.fn().mockResolvedValue({ sub: "user_1" })
    };
    const controller = new KycController(kycService as never, authService as never, {} as never);

    await expect(controller.verifyBvn({ bvn: "12345678901" }, "Bearer access_token")).resolves.toMatchObject({
      success: true,
      data: { kycReference: "kyc_ref_auth", bvnVerified: true }
    });

    expect(authService.validateAccessToken).toHaveBeenCalledWith("access_token");
    expect(kycService.verifyBvn).toHaveBeenCalledWith("user_1", "12345678901");
  });

  it("routes registration liveness start and completion without trusting client identity data", async () => {
    const authService = {
      startRegistrationLiveness: jest.fn().mockResolvedValue({
        livenessSessionId: "live_1",
        status: "pending",
        url: "https://verify.example.com/live_1"
      }),
      completeRegistrationLiveness: jest.fn().mockResolvedValue({
        kycStatus: "verified",
        faceMatch: true,
        livenessStatus: "passed"
      }),
      getRegistrationLivenessStatus: jest.fn().mockResolvedValue({
        livenessSessionId: "live_1",
        status: "passed",
        usableForFaceMatch: true
      })
    };
    const controller = new KycController({} as never, authService as never, {} as never);
    const base = { registrationToken: "reg_temp_123", kycReference: "kyc_ref_123" };

    await expect(controller.startLiveness(base)).resolves.toMatchObject({
      success: true,
      data: { livenessSessionId: "live_1", status: "pending" }
    });
    await expect(controller.completeLiveness({
      ...base,
      livenessSessionId: "live_1",
      profileImageBase64: "data:image/jpeg;base64,aGVsbG8="
    })).resolves.toMatchObject({
      success: true,
      data: { faceMatch: true, livenessStatus: "passed" }
    });
    await expect(controller.livenessStatus({
      ...base,
      livenessSessionId: "live_1"
    })).resolves.toMatchObject({
      success: true,
      data: { status: "passed", usableForFaceMatch: true }
    });
    expect(authService.completeRegistrationLiveness).toHaveBeenCalledWith(
      "reg_temp_123",
      "kyc_ref_123",
      "live_1",
      "data:image/jpeg;base64,aGVsbG8="
    );
  });
});
