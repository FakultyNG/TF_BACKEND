import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CreateDvaDto } from "./dto/create-dva.dto";
import { WalletService } from "./wallet.service";

@ApiTags("Wallet")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("wallet")
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post("dva/create")
  async createDva(@CurrentUser() user: { sub: string }, @Body() dto: CreateDvaDto) {
    const data = await this.walletService.createDva(user.sub, dto.preferredBank || "auto");
    return success("Dedicated virtual account created successfully", data);
  }

  @Get("dva")
  async getDva(@CurrentUser() user: { sub: string }) {
    const data = await this.walletService.getDva(user.sub);
    return success("Dedicated virtual account fetched successfully", data);
  }

  @Get("balance")
  async balance(@CurrentUser() user: { sub: string }) {
    const data = await this.walletService.getBalance(user.sub);
    return success("Wallet balance fetched successfully", data);
  }

  @Get("summary")
  async summary(@CurrentUser() user: { sub: string }) {
    const data = await this.walletService.getSummary(user.sub);
    return success("Wallet summary fetched successfully", data);
  }
}
