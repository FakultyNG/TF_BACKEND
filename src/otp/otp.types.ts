import { OtpPurpose } from "../providers/interfaces/otp-provider.interface";

export interface OtpSession {
  phoneNumber: string;
  otp?: string;
  attempts: number;
  purpose: OtpPurpose;
  provider: string;
  providerReference: string;
  expiresAt: string;
  verified: boolean;
  validated?: boolean;
}
