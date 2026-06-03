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
      provider: this.config.get<string>("MOCK_KYC_PROVIDER", "mock"),
      providerReference: `mock_bvn_${Date.now()}`,
      bvnMasked: "*******0000",
      bvnVerified: true,
      firstName: "John",
      middleName: "Test",
      lastName: "Musa",
      email: "test@test.com",
      phoneNumber: "07000000000",
      dateOfBirth: "1990-01-01",
      gender: "male",
      country: "Nigeria",
      rawProviderResponse: { status: true, provider: "mock" }
    };
  }

  async verifyBvnWithSelfie(_: string, selfieImageBase64: string): Promise<SelfieValidationResult> {
    const kycReference = `mock_selfie_${Date.now()}`;
    return {
      provider: this.config.get<string>("MOCK_KYC_PROVIDER", "mock"),
      providerReference: kycReference,
      bvnMasked: "*******0000",
      bvnVerified: true,
      faceMatch: true,
      selfieVerified: true,
      confidenceScore: Number(this.config.get<string>("MOCK_KYC_FACE_SCORE", "99.9962")),
      firstName: "John",
      middleName: "Test",
      lastName: "Musa",
      email: "test@test.com",
      phoneNumber: "07000000000",
      dateOfBirth: "1990-01-01",
      gender: "male",
      country: "Nigeria",
      profileImageUrl: `https://res.cloudinary.com/dcqfxryee/image/upload/v174852/profile_${kycReference}.jpg`,
      rawProviderResponse: { status: true, imageLength: selfieImageBase64.length }
    };
  }

  async getVerificationStatus(providerReference: string): Promise<BvnVerificationResult> {
    return {
      provider: this.config.get<string>("MOCK_KYC_PROVIDER", "mock"),
      providerReference,
      bvnVerified: true,
      rawProviderResponse: { status: true, reference: providerReference }
    };
  }
}
