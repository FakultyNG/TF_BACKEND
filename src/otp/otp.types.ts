export interface OtpSession {
  phoneNumber: string;
  otp: string;
  attempts: number;
  purpose: "phone_verification" | "passcode_reset";
  validated?: boolean;
}
