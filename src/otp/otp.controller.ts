import { Body, Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
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
  @ApiOperation({ summary: "Send OTP", description: "Sends an SMS OTP through the configured backend OTP provider. Flutter must not call Sendchamp directly." })
  @ApiResponse({
    status: 201,
    description: "OTP sent successfully",
    schema: {
      example: {
        success: true,
        message: "OTP sent successfully",
        data: { phoneNumber: "2348103100000", otpReference: "otp_ref_12345" }
      }
    }
  })
  async send(@Body() dto: SendOtpDto) {
    const data = await this.otpService.sendOtp(dto.phoneNumber);
    return success("OTP sent successfully", data);
  }

  @Post("resend")
  @ApiOperation({ summary: "Resend OTP", description: "Creates a new provider OTP for an existing TF OTP reference." })
  @ApiResponse({
    status: 201,
    description: "OTP resent successfully",
    schema: {
      example: {
        success: true,
        message: "OTP resent successfully",
        data: { otpReference: "otp_ref_67890" }
      }
    }
  })
  async resend(@Body() dto: ResendOtpDto) {
    const data = await this.otpService.resendOtp(dto.phoneNumber, dto.otpReference);
    return success("OTP resent successfully", { otpReference: data.otpReference });
  }

  @Post("validate")
  @ApiOperation({ summary: "Validate OTP", description: "Validates the OTP with the configured backend OTP provider and marks the TF OTP reference as verified." })
  @ApiResponse({
    status: 201,
    description: "OTP validated successfully",
    schema: {
      example: {
        success: true,
        message: "OTP validated successfully",
        data: { phoneVerified: true, phoneNumber: "2348103100000" }
      }
    }
  })
  async validate(@Body() dto: ValidateOtpDto) {
    const data = await this.otpService.validateOtp(dto.phoneNumber, dto.otp, dto.otpReference);
    return success("OTP validated successfully", {
      phoneVerified: data.phoneVerified,
      phoneNumber: data.phoneNumber
    });
  }
}
