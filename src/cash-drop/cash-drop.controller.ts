import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CashDropService } from "./cash-drop.service";
import { DisableCashDropDto } from "./dto/disable-cash-drop.dto";
import { RegisterCashDropDto } from "./dto/register-cash-drop.dto";
import { ResolveCashDropDto } from "./dto/resolve-cash-drop.dto";

@ApiTags("CashDrop")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("cash-drop")
export class CashDropController {
  constructor(private readonly cashDropService: CashDropService) {}

  @Post("register")
  async register(@CurrentUser() user: { sub: string }, @Body() _dto: RegisterCashDropDto) {
    const data = await this.cashDropService.register(user.sub);
    return success("Profile image linked to CashDrop successfully", data);
  }

  @Get("status")
  async status(@CurrentUser() user: { sub: string }) {
    const data = await this.cashDropService.status(user.sub);
    return success("CashDrop status fetched successfully", data);
  }

  @Post("disable")
  async disable(@CurrentUser() user: { sub: string }, @Body() dto: DisableCashDropDto) {
    const data = await this.cashDropService.disable(user.sub, dto.reason);
    return success("CashDrop disabled successfully", data);
  }

  @Post("resolve")
  async resolve(@CurrentUser() user: { sub: string }, @Body() dto: ResolveCashDropDto) {
    const data = await this.cashDropService.resolve(user.sub, dto.scannedImageBase64);
    return success("Payment profile resolved successfully", data);
  }
}
