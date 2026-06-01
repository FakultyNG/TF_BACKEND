import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  BvnVerificationResult,
  KycProvider,
  SelfieValidationResult
} from "../interfaces/kyc-provider.interface";

@Injectable()
export class MockKycProvider implements KycProvider {
  constructor(private readonly config: ConfigService) {}

  async verifyBvn(_: string): Promise<BvnVerificationResult> {
    return {
      bvnVerified: true,
      firstName: "John",
      lastName: "Musa",
      email: "test@test.com",
      dateOfBirth: "1990-01-01",
      country: "Nigeria"
    };
  }

  async validateSelfie(kycReference: string, _: string): Promise<SelfieValidationResult> {
    return {
      faceMatch: true,
      confidenceScore: Number(this.config.get<string>("MOCK_KYC_FACE_SCORE", "99.9962")),
      profileImageUrl: `https://res.cloudinary.com/dcqfxryee/image/upload/v174852/profile_${kycReference}.jpg`
    };
  }
}
