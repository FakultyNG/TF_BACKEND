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
  faceMatchStatus?: string;
  faceMatchReason?: string;
  livenessStatus?: string;
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

export interface KycVerificationContext {
  phoneNumber?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string;
  reference?: string;
}

export interface LivenessSessionResult {
  provider: string;
  id: string;
  reference?: string;
  status: "pending" | "passed" | "failed" | "expired" | string;
  url?: string;
  score?: number;
  reasons: string[];
  usableForFaceMatch: boolean;
  expiresAt?: string;
  rawProviderResponse?: unknown;
}

export interface KycProvider {
  verifyBvn(bvn: string, userId?: string, context?: KycVerificationContext): Promise<BvnVerificationResult>;
  verifyBvnWithSelfie(bvn: string, selfieImageBase64: string, userId?: string, context?: KycVerificationContext): Promise<SelfieValidationResult>;
  createLivenessSession?(redirectUrl: string, context?: KycVerificationContext): Promise<LivenessSessionResult>;
  getLivenessSession?(sessionId: string): Promise<LivenessSessionResult>;
  verifyBvnWithLiveness?(bvn: string, livenessSessionId: string, userId?: string, context?: KycVerificationContext): Promise<SelfieValidationResult>;
  getVerificationStatus(providerReference: string): Promise<BvnVerificationResult | SelfieValidationResult>;
}
