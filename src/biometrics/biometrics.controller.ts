import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { BiometricLoginDto } from "./dto/biometric-login.dto";
import { BiometricStatusQueryDto } from "./dto/biometric-status-query.dto";
import { DisableBiometricDto } from "./dto/disable-biometric.dto";
import { EnableBiometricDto } from "./dto/enable-biometric.dto";
import { BiometricsService } from "./biometrics.service";

@ApiTags("Biometrics")
@Controller("auth/biometric")
export class BiometricsController {
  constructor(private readonly biometricsService: BiometricsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("status")
  async status(@CurrentUser() user: { sub: string }, @Query() query: BiometricStatusQueryDto) {
    const data = await this.biometricsService.getStatus(user.sub, query.deviceId);
    return success("Biometric status fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("enable")
  async enable(@CurrentUser() user: { sub: string }, @Body() dto: EnableBiometricDto) {
    const data = await this.biometricsService.enable(user.sub, dto);
    return success("Biometric login enabled successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("disable")
  async disable(@CurrentUser() user: { sub: string }, @Body() dto: DisableBiometricDto) {
    const data = await this.biometricsService.disable(user.sub, dto.deviceId);
    return success("Biometric login disabled successfully", data);
  }

  @Post("login")
  async login(@Body() dto: BiometricLoginDto, @Req() request: Request) {
    const data = await this.biometricsService.login(dto.deviceId, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
    return success("Biometric login successful", data);
  }
}
