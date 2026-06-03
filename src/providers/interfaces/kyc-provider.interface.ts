export interface BvnVerificationResult {
  provider: string;
  providerReference?: string;
  bvnMasked?: string;
  bvnVerified: boolean;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  country?: string;
  ninMasked?: string;
  ninHash?: string;
  imageUrl?: string;
  rawProviderResponse?: unknown;
}

export interface SelfieValidationResult {
  provider: string;
  providerReference?: string;
  bvnMasked?: string;
  bvnVerified: boolean;
  faceMatch: boolean;
  selfieVerified: boolean;
  confidenceScore: number;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  country?: string;
  ninMasked?: string;
  ninHash?: string;
  imageUrl?: string;
  profileImageUrl?: string;
  rawProviderResponse?: unknown;
}

export interface KycProvider {
  verifyBvn(bvn: string, userId?: string): Promise<BvnVerificationResult>;
  verifyBvnWithSelfie(bvn: string, selfieImageBase64: string, userId?: string): Promise<SelfieValidationResult>;
  getVerificationStatus(providerReference: string): Promise<BvnVerificationResult | SelfieValidationResult>;
}
