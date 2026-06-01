import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminCashDropQueryDto } from "./dto/admin-cash-drop-query.dto";
import { DisableCashDropDto } from "./dto/disable-cash-drop.dto";
import { CashDropService } from "./cash-drop.service";

@ApiTags("Admin CashDrop")
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
@Controller("admin/cash-drop")
export class AdminCashDropController {
  constructor(private readonly cashDropService: CashDropService) {}

  @Get("profiles")
  async list(@Query() query: AdminCashDropQueryDto) {
    const data = await this.cashDropService.listAdmin(query);
    return success("CashDrop profiles fetched successfully", data);
  }

  @Get("profiles/:cashDropId")
  async details(@Param("cashDropId") cashDropId: string) {
    const data = await this.cashDropService.getAdmin(cashDropId);
    return success("CashDrop profile fetched successfully", data);
  }

  @Post("profiles/:cashDropId/disable")
  async disable(@CurrentUser() admin: { sub: string }, @Param("cashDropId") cashDropId: string, @Body() dto: DisableCashDropDto) {
    const data = await this.cashDropService.adminDisable(admin.sub, cashDropId, dto.reason);
    return success("CashDrop profile disabled successfully", data);
  }

  @Post("profiles/:cashDropId/enable")
  async enable(@CurrentUser() admin: { sub: string }, @Param("cashDropId") cashDropId: string) {
    const data = await this.cashDropService.adminEnable(admin.sub, cashDropId);
    return success("CashDrop profile enabled successfully", data);
  }
}
