export interface SendOtpInput {
  phoneNumber: string;
  otp: string;
  purpose: string;
}

export interface OtpProvider {
  sendOtp(input: SendOtpInput): Promise<void>;
}
