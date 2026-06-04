export type OtpPurpose = "registration" | "login_verification" | "passcode_reset" | "sensitive_action" | "phone_verification";

export interface SendOtpInput {
  otpReference: string;
  phoneNumber: string;
  purpose: OtpPurpose;
  otp?: string;
}

export interface OtpSendResult {
  provider: "mock" | "sendchamp" | string;
  providerReference: string;
  status?: string;
}

export interface ConfirmOtpInput {
  otpReference: string;
  phoneNumber: string;
  purpose: OtpPurpose;
  providerReference: string;
  otp: string;
  expectedOtp?: string;
}

export interface OtpConfirmResult {
  provider: "mock" | "sendchamp" | string;
  verified: boolean;
  status?: string;
}

export interface OtpProvider {
  sendOtp(input: SendOtpInput): Promise<OtpSendResult>;
  confirmOtp(input: ConfirmOtpInput): Promise<OtpConfirmResult>;
}
