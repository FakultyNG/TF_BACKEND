import { Injectable } from "@nestjs/common";
import { SendOtpInput, OtpProvider } from "../interfaces/otp-provider.interface";

@Injectable()
export class MockOtpProvider implements OtpProvider {
  async sendOtp(input: SendOtpInput): Promise<void> {
    console.log(
      JSON.stringify({
        provider: "mock-otp",
        phoneNumber: input.phoneNumber,
        purpose: input.purpose,
        otp: input.otp
      })
    );
  }
}
