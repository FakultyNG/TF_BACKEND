import { Body, Controller, Get, Headers, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthService } from "./auth.service";
import { CompleteRegistrationDto } from "./dto/complete-registration.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterKycBvnDto } from "./dto/register-kyc-bvn.dto";
import { RegisterKycSelfieDto } from "./dto/register-kyc-selfie.dto";
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
  async verifyRegistrationBvn(@Body() dto: RegisterKycBvnDto) {
    const data = await this.authService.verifyRegistrationBvn(dto.registrationToken, dto.bvn);
    return success("BVN verified successfully", data);
  }

  @Post("register/kyc/selfie-validate")
  async validateRegistrationSelfie(@Body() dto: RegisterKycSelfieDto) {
    const data = await this.authService.validateRegistrationSelfie(dto.registrationToken, dto.kycReference, dto.selfieImageBase64);
    return success("Selfie validation successful", data);
  }

  @Post("login")
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const data = await this.authService.login(dto, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    return success("Login successful", data);
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
