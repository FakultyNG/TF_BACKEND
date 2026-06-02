import { KycStatus } from "@prisma/client";
import { BvnVerificationResult, SelfieValidationResult } from "../../providers/interfaces/kyc-provider.interface";

export interface RegistrationKycState {
  kycReference: string;
  bvnHash: string;
  bvnVerified: boolean;
  status: KycStatus;
  providerResult: BvnVerificationResult;
  selfieVerified?: boolean;
  faceMatch?: boolean;
  confidenceScore?: number;
  selfieImageUrl?: string;
  selfieUploadId?: string;
  selfieResult?: SelfieValidationResult;
}

export interface RegistrationSession {
  phoneNumber: string;
  requiresOtp: true;
  createdAt: string;
  kyc?: RegistrationKycState;
}
