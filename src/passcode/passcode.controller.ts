import { Body, Controller, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ChangePasscodeDto } from "./dto/change-passcode.dto";
import { CompleteResetDto } from "./dto/complete-reset.dto";
import { RequestResetDto } from "./dto/request-reset.dto";
import { VerifyResetDto } from "./dto/verify-reset.dto";
import { PasscodeService } from "./passcode.service";

@ApiTags("Passcode")
@Controller("auth/passcode")
export class PasscodeController {
  constructor(private readonly passcodeService: PasscodeService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch("change")
  async change(@CurrentUser() user: { sub: string }, @Body() dto: ChangePasscodeDto) {
    const data = await this.passcodeService.change(user.sub, dto.oldPasscode, dto.newPasscode);
    return success("Passcode changed successfully", data);
  }

  @Post("reset/request")
  async requestReset(@Body() dto: RequestResetDto) {
    const data = await this.passcodeService.requestReset(dto.phoneNumber);
    return success("Passcode reset OTP sent successfully", data);
  }

  @Post("reset/verify")
  async verifyReset(@Body() dto: VerifyResetDto) {
    const data = await this.passcodeService.verifyReset(dto.phoneNumber, dto.otp, dto.otpReference);
    return success("OTP verified successfully", data);
  }

  @Post("reset/complete")
  async completeReset(@Body() dto: CompleteResetDto) {
    const data = await this.passcodeService.completeReset(dto.resetToken, dto.newPasscode);
    return success("Passcode reset successfully", data);
  }
}
