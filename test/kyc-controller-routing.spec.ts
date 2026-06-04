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
    const controller = new KycController(kycService as never, authService as never);

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
    const controller = new KycController(kycService as never, authService as never);

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
    const controller = new KycController(kycService as never, authService as never);

    await expect(controller.verifyBvn({ bvn: "12345678901" }, "Bearer access_token")).resolves.toMatchObject({
      success: true,
      data: { kycReference: "kyc_ref_auth", bvnVerified: true }
    });

    expect(authService.validateAccessToken).toHaveBeenCalledWith("access_token");
    expect(kycService.verifyBvn).toHaveBeenCalledWith("user_1", "12345678901");
  });
});
