import { Controller, Delete, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RecentBeneficiaryQueryDto } from "./dto/recent-beneficiary-query.dto";
import { RecentBeneficiariesService } from "./recent-beneficiaries.service";

@ApiTags("Recent Beneficiaries")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("transfers/recent-beneficiaries")
export class RecentBeneficiariesController {
  constructor(private readonly beneficiaries: RecentBeneficiariesService) {}

  @Get()
  async list(@CurrentUser() user: { sub: string }, @Query() query: RecentBeneficiaryQueryDto) {
    const data = await this.beneficiaries.list(user.sub, query);
    return success("Recent beneficiaries fetched successfully", data);
  }

  @Get("search")
  async search(@CurrentUser() user: { sub: string }, @Query() query: RecentBeneficiaryQueryDto) {
    const data = await this.beneficiaries.search(user.sub, query);
    return success("Recent beneficiaries search successful", data);
  }

  @Delete(":beneficiaryId")
  async delete(@CurrentUser() user: { sub: string }, @Param("beneficiaryId") beneficiaryId: string) {
    const data = await this.beneficiaries.delete(user.sub, beneficiaryId);
    return success("Recent beneficiary deleted successfully", data);
  }
}
