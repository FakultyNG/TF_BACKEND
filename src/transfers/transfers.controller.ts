import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ConfirmTransferDto } from "./dto/confirm-transfer.dto";
import { FxTransferQuoteDto } from "./dto/fx-transfer-quote.dto";
import { NgnTransferQuoteDto } from "./dto/ngn-transfer-quote.dto";
import { ResolveAccountDto } from "./dto/resolve-account.dto";
import { SuggestNgnBanksDto } from "./dto/suggest-ngn-banks.dto";
import { TransfersService } from "./transfers.service";

@ApiTags("Transfers")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("transfers")
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get("ngn/banks")
  async banks() {
    const data = await this.transfersService.getBanks();
    return success("Banks fetched successfully", data);
  }

  @Post("ngn/resolve-account")
  async resolve(@Body() dto: ResolveAccountDto) {
    const data = await this.transfersService.resolveAccount(dto.bankCode, dto.accountNumber);
    return success("Account resolved successfully", data);
  }

  @Post("ngn/suggest-banks")
  @ApiOperation({
    summary: "Suggest NGN banks by account number",
    description: "Returns up to 3 possible NGN bank/account matches sorted by highest confidence first."
  })
  @ApiOkResponse({
    description: "Bank suggestions fetched successfully",
    schema: {
      example: {
        success: true,
        message: "Bank suggestions fetched successfully",
        data: {
          accountNumber: "0123456789",
          suggestions: [
            {
              accountName: "JOHN DOE",
              accountNumber: "0123456789",
              bankCode: "044",
              bankName: "Access Bank",
              confidence: 95
            },
            {
              accountName: "JOHN DOE",
              accountNumber: "0123456789",
              bankCode: "058",
              bankName: "GTBank",
              confidence: 88
            },
            {
              accountName: "JOHN DOE",
              accountNumber: "0123456789",
              bankCode: "035",
              bankName: "Wema Bank",
              confidence: 80
            }
          ]
        }
      }
    }
  })
  async suggestBanks(@Body() dto: SuggestNgnBanksDto) {
    const data = await this.transfersService.suggestBanksByAccountNumber(dto.accountNumber);
    return success("Bank suggestions fetched successfully", data);
  }

  @Post("ngn/quote")
  async ngnQuote(@CurrentUser() user: { sub: string }, @Body() dto: NgnTransferQuoteDto) {
    const data = await this.transfersService.quoteNgn(user.sub, dto);
    return success("Transfer quote generated successfully", data);
  }

  @Post("ngn/confirm")
  async ngnConfirm(@CurrentUser() user: { sub: string }, @Body() dto: ConfirmTransferDto) {
    const data = await this.transfersService.confirmNgn(user.sub, dto.quoteId, dto.passcode, dto.narration);
    return success("Transfer submitted successfully", data);
  }

  @Post("usd/quote")
  async usdQuote(@CurrentUser() user: { sub: string }, @Body() dto: FxTransferQuoteDto) {
    const data = await this.transfersService.quoteFx(user.sub, "USD", dto);
    return success("USD transfer quote generated successfully", data);
  }

  @Post("usd/confirm")
  async usdConfirm(@CurrentUser() user: { sub: string }, @Body() dto: ConfirmTransferDto) {
    const data = await this.transfersService.confirmFx(user.sub, "USD", dto.quoteId, dto.passcode, dto.purpose);
    return success("USD transfer submitted successfully", data);
  }

  @Post("cny/quote")
  async cnyQuote(@CurrentUser() user: { sub: string }, @Body() dto: FxTransferQuoteDto) {
    const data = await this.transfersService.quoteFx(user.sub, "CNY", dto);
    return success("CNY transfer quote generated successfully", data);
  }

  @Post("cny/confirm")
  async cnyConfirm(@CurrentUser() user: { sub: string }, @Body() dto: ConfirmTransferDto) {
    const data = await this.transfersService.confirmFx(user.sub, "CNY", dto.quoteId, dto.passcode, dto.purpose);
    return success("CNY transfer submitted successfully", data);
  }
}
