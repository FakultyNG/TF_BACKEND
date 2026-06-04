import { Injectable } from "@nestjs/common";
import { ConfirmOtpInput, OtpConfirmResult, OtpProvider, OtpSendResult, SendOtpInput } from "../interfaces/otp-provider.interface";

@Injectable()
export class MockOtpProvider implements OtpProvider {
  async sendOtp(input: SendOtpInput): Promise<OtpSendResult> {
    console.log(
      JSON.stringify({
        provider: "mock-otp",
        phoneNumber: input.phoneNumber,
        purpose: input.purpose,
        otpReference: input.otpReference
      })
    );
    return {
      provider: "mock",
      providerReference: `mock_${input.otpReference}`
    };
  }

  async confirmOtp(input: ConfirmOtpInput): Promise<OtpConfirmResult> {
    const verified = Boolean(input.expectedOtp && input.otp === input.expectedOtp);
    return {
      provider: "mock",
      verified,
      status: verified ? "confirmed" : "invalid"
    };
  }
}
