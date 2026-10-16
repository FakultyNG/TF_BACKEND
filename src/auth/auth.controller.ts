import { Body, Controller, Get, Headers, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthService } from "./auth.service";
import { CompleteRegistrationDto } from "./dto/complete-registration.dto";
import { FaceUnlockDto } from "./dto/face-unlock.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterKycBvnDto } from "./dto/register-kyc-bvn.dto";
import { RegisterKycSelfieDto } from "./dto/register-kyc-selfie.dto";
import {
  CompleteRegisterKycLivenessDto,
  RegisterKycLivenessDto,
  RegisterKycLivenessStatusDto
} from "./dto/register-kyc-liveness.dto";
import { StartRegistrationDto } from "./dto/start-registration.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register/start")
  async startRegistration(@Body() dto: StartRegistrationDto) {
    const data = await this.authService.startRegistration(dto.phoneNumber);
    return success("Registration started successfully", data);
  }

  @Post("register/complete")
  async completeRegistration(@Body() dto: CompleteRegistrationDto, @Req() req: Request) {
    const data = await this.authService.completeRegistration(dto, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    return success("Registration completed successfully", data);
  }

  @Post("register/kyc/bvn/verify")
  @ApiExcludeEndpoint()
  async verifyRegistrationBvn(@Body() dto: RegisterKycBvnDto) {
    const data = await this.authService.verifyRegistrationBvn(dto.registrationToken, dto.bvn);
    return success("BVN verified successfully", data);
  }

  @Post("register/kyc/selfie-validate")
  @ApiExcludeEndpoint()
  async validateRegistrationSelfie(@Body() dto: RegisterKycSelfieDto) {
    const data = await this.authService.validateRegistrationSelfie(dto.registrationToken, dto.kycReference, dto.selfieImageBase64);
    return success("Selfie validation successful", data);
  }

  @Post("register/kyc/liveness/start")
  @ApiExcludeEndpoint()
  async startRegistrationLiveness(@Body() dto: RegisterKycLivenessDto) {
    const data = await this.authService.startRegistrationLiveness(dto.registrationToken, dto.kycReference);
    return success("Liveness session started successfully", data);
  }

  @Post("register/kyc/liveness/complete")
  @ApiExcludeEndpoint()
  async completeRegistrationLiveness(@Body() dto: CompleteRegisterKycLivenessDto) {
    const data = await this.authService.completeRegistrationLiveness(
      dto.registrationToken,
      dto.kycReference,
      dto.livenessSessionId,
      dto.profileImageBase64
    );
    return success("Liveness session checked successfully", data);
  }

  @Post("register/kyc/liveness/status")
  @ApiExcludeEndpoint()
  async registrationLivenessStatus(@Body() dto: RegisterKycLivenessStatusDto) {
    const data = await this.authService.getRegistrationLivenessStatus(
      dto.registrationToken,
      dto.kycReference,
      dto.livenessSessionId
    );
    return success("Liveness session status fetched successfully", data);
  }

  @Post("login")
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const data = await this.authService.login(dto, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    return success("Login successful", data);
  }

  @Get("face-unlock/config")
  faceUnlockConfig() {
    return success("Face unlock config fetched successfully", this.authService.faceUnlockConfig());
  }

  @Post("face-unlock")
  async faceUnlock(@Body() dto: FaceUnlockDto, @Req() req: Request) {
    const data = await this.authService.faceUnlock(dto.phoneNumber, dto.faceImageBase64, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    return success("Face unlock successful", data);
  }

  @Post("refresh-token")
  async refresh(@Body() dto: RefreshTokenDto) {
    const data = await this.authService.refreshToken(dto.refreshToken);
    return success("Token refreshed successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("logout")
  async logout(@CurrentUser() user: { sub: string; sid?: string }) {
    const data = await this.authService.logout(user.sub, user.sid);
    return success("Logged out successfully", data);
  }
}
