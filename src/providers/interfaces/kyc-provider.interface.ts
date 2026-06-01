export interface BvnVerificationResult {
  bvnVerified: boolean;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  country: string;
}

export interface SelfieValidationResult {
  faceMatch: boolean;
  confidenceScore: number;
  profileImageUrl: string;
}

export interface KycProvider {
  verifyBvn(bvn: string): Promise<BvnVerificationResult>;
  validateSelfie(kycReference: string, selfieImageBase64: string): Promise<SelfieValidationResult>;
}
