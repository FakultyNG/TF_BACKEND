import { Body, Controller, Get, Headers, HttpStatus, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Response } from "express";
import { ApiException } from "../common/errors/api.exception";
import {
  CompleteRegisterKycLivenessDto,
  RegisterKycLivenessDto,
  RegisterKycLivenessStatusDto
} from "../auth/dto/register-kyc-liveness.dto";
import { SelfieValidateDto } from "./dto/selfie-validate.dto";
import { VerifyBvnDto } from "./dto/verify-bvn.dto";
import { KycService } from "./kyc.service";

@ApiTags("KYC")
@Controller("kyc")
export class KycController {
  constructor(
    private readonly kycService: KycService,
    private readonly authService: AuthService,
    private readonly config: ConfigService
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

  @Post("bvn/liveness/start")
  async startLiveness(@Body() dto: RegisterKycLivenessDto) {
    const data = await this.authService.startRegistrationLiveness(dto.registrationToken, dto.kycReference);
    return success("Liveness session started successfully", data);
  }

  @Post("bvn/liveness/complete")
  async completeLiveness(@Body() dto: CompleteRegisterKycLivenessDto) {
    const data = await this.authService.completeRegistrationLiveness(
      dto.registrationToken,
      dto.kycReference,
      dto.livenessSessionId,
      dto.profileImageBase64
    );
    return success("Liveness session checked successfully", data);
  }

  @Post("bvn/liveness/status")
  async livenessStatus(@Body() dto: RegisterKycLivenessStatusDto) {
    const data = await this.authService.getRegistrationLivenessStatus(
      dto.registrationToken,
      dto.kycReference,
      dto.livenessSessionId
    );
    return success("Liveness session status fetched successfully", data);
  }

  @Get("bvn/liveness/return")
  livenessReturn(
    @Query("liveness_session_id") livenessSessionId: string | undefined,
    @Query("status") status: string | undefined,
    @Query("reference") reference: string | undefined,
    @Res() response: Response
  ) {
    const appReturnUrl = this.config.get<string>("KYC_LIVENESS_APP_RETURN_URL", "transfa://kyc/liveness-complete");
    const separator = appReturnUrl.includes("?") ? "&" : "?";
    const query = new URLSearchParams({
      liveness_session_id: livenessSessionId ?? "",
      status: status ?? "",
      reference: reference ?? ""
    });
    return response.redirect(HttpStatus.FOUND, `${appReturnUrl}${separator}${query.toString()}`);
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
