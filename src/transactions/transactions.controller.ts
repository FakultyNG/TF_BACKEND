import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TransactionQueryDto } from "./dto/transaction-query.dto";
import { TransactionsService } from "./transactions.service";

@ApiTags("Transactions")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("transactions")
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  async list(@CurrentUser() user: { sub: string }, @Query() query: TransactionQueryDto) {
    const data = await this.transactionsService.listUserTransactions(user.sub, query);
    return success("Transactions fetched successfully", data);
  }

  @Get(":id")
  async details(@CurrentUser() user: { sub: string }, @Param("id") id: string) {
    const data = await this.transactionsService.getUserTransaction(user.sub, id);
    return success("Transaction fetched successfully", data);
  }
}
