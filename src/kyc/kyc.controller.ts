import { Body, Controller, Get, Headers, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ApiException } from "../common/errors/api.exception";
import { SelfieValidateDto } from "./dto/selfie-validate.dto";
import { VerifyBvnDto } from "./dto/verify-bvn.dto";
import { KycService } from "./kyc.service";

@ApiTags("KYC")
@Controller("kyc")
export class KycController {
  constructor(
    private readonly kycService: KycService,
    private readonly authService: AuthService
  ) {}

  @Post("bvn/verify")
  async verifyBvn(@Body() dto: VerifyBvnDto, @Headers("authorization") authorization?: string) {
    if (dto.registrationToken) {
      const data = await this.authService.verifyRegistrationBvn(dto.registrationToken, dto.bvn);
      return success("BVN verified successfully", data);
    }
    const user = await this.requireBearerUser(authorization);
    const data = await this.kycService.verifyBvn(user.sub, dto.bvn);
    return success("BVN verified successfully", data);
  }

  @Post("bvn/selfie-validate")
  async selfie(@Body() dto: SelfieValidateDto, @Headers("authorization") authorization?: string) {
    if (dto.registrationToken) {
      const data = await this.authService.validateRegistrationSelfie(
        dto.registrationToken,
        dto.kycReference,
        dto.selfieImageBase64
      );
      return success("Selfie validation successful", data);
    }
    const user = await this.requireBearerUser(authorization);
    const data = await this.kycService.validateSelfie(user.sub, dto.kycReference, dto.selfieImageBase64);
    return success("Selfie validation successful", data);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("status")
  async status(@CurrentUser() user: { sub: string }) {
    const data = await this.kycService.getStatus(user.sub);
    return success("KYC status fetched successfully", data);
  }

  private async requireBearerUser(authorization?: string) {
    const token = authorization?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      throw new ApiException("Unauthorized", "UNAUTHORIZED", HttpStatus.UNAUTHORIZED);
    }
    return this.authService.validateAccessToken(token);
  }
}
