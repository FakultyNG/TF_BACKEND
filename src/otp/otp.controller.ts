import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { success } from "../common/api-response";
import { ResendOtpDto } from "./dto/resend-otp.dto";
import { SendOtpDto } from "./dto/send-otp.dto";
import { ValidateOtpDto } from "./dto/validate-otp.dto";
import { OtpService } from "./otp.service";

@ApiTags("OTP")
@Controller("auth/otp")
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post("send")
  async send(@Body() dto: SendOtpDto) {
    const data = await this.otpService.sendOtp(dto.phoneNumber);
    return success("OTP sent successfully", data);
  }

  @Post("resend")
  async resend(@Body() dto: ResendOtpDto) {
    const data = await this.otpService.resendOtp(dto.phoneNumber, dto.otpReference);
    return success("OTP resent successfully", { otpReference: data.otpReference });
  }

  @Post("validate")
  async validate(@Body() dto: ValidateOtpDto) {
    const data = await this.otpService.validateOtp(dto.phoneNumber, dto.otp, dto.otpReference);
    return success("OTP validated successfully", {
      phoneVerified: data.phoneVerified,
      phoneNumber: data.phoneNumber
    });
  }
}
