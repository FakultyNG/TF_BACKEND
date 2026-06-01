import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SelfieValidateDto } from "./dto/selfie-validate.dto";
import { VerifyBvnDto } from "./dto/verify-bvn.dto";
import { KycService } from "./kyc.service";

@ApiTags("KYC")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("kyc")
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post("bvn/verify")
  async verifyBvn(@CurrentUser() user: { sub: string }, @Body() dto: VerifyBvnDto) {
    const data = await this.kycService.verifyBvn(user.sub, dto.bvn);
    return success("BVN verified successfully", data);
  }

  @Post("bvn/selfie-validate")
  async selfie(@CurrentUser() user: { sub: string }, @Body() dto: SelfieValidateDto) {
    const data = await this.kycService.validateSelfie(user.sub, dto.kycReference, dto.selfieImageBase64);
    return success("Selfie validation successful", data);
  }

  @Get("status")
  async status(@CurrentUser() user: { sub: string }) {
    const data = await this.kycService.getStatus(user.sub);
    return success("KYC status fetched successfully", data);
  }
}
