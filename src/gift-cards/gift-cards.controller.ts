import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CreateGiftCardDto } from "./dto/create-gift-card.dto";
import { GiftCardQuoteDto } from "./dto/gift-card-quote.dto";
import { GiftCardsService } from "./gift-cards.service";

@ApiTags("Gift Cards")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("gift-cards")
export class GiftCardsController {
  constructor(private readonly giftCardsService: GiftCardsService) {}

  @Get()
  async list() {
    const data = await this.giftCardsService.listProducts();
    return success("Gift cards fetched successfully", data);
  }

  @Post("quote")
  async quote(@CurrentUser() user: { sub: string }, @Body() dto: GiftCardQuoteDto) {
    const data = await this.giftCardsService.quote(user.sub, dto);
    return success("Gift card quote generated successfully", data);
  }

  @Post("create")
  async create(@CurrentUser() user: { sub: string }, @Body() dto: CreateGiftCardDto) {
    const data = await this.giftCardsService.create(user.sub, dto.quoteId, dto.passcode);
    return success("Gift card purchase submitted successfully", data);
  }

  @Get(":id")
  async details(@CurrentUser() user: { sub: string }, @Param("id") id: string) {
    const data = await this.giftCardsService.getDetails(user.sub, id);
    return success("Gift card details fetched successfully", data);
  }
}
