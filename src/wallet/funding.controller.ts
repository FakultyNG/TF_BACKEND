import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { VerifyFundingDto } from "./dto/verify-funding.dto";
import { WalletService } from "./wallet.service";

@ApiTags("Funding")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("funding")
export class FundingController {
  constructor(private readonly walletService: WalletService) {}

  @Post("verify")
  async verify(@CurrentUser() user: { sub: string }, @Body() dto: VerifyFundingDto) {
    const data = await this.walletService.verifyFunding(user.sub, dto.reference);
    return success("Funding verified successfully", data);
  }
}
