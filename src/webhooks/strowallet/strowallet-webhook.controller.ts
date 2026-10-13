import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { StrowalletWebhookService } from "./strowallet-webhook.service";

@ApiTags("Provider Webhooks")
@Controller("webhooks/strowallet")
export class StrowalletWebhookController {
  constructor(private readonly service: StrowalletWebhookService) {}

  @Post("virtual-account")
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async receiveVirtualAccountCredit(@Body() dto: Record<string, unknown>) {
    const result = await this.service.receiveVirtualAccountCredit(dto);
    return {
      success: true,
      message: result.duplicate ? "Duplicate webhook ignored" : "Webhook received"
    };
  }

  @Post("bank-transfer")
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async receiveBankTransfer(@Body() dto: Record<string, unknown>) {
    const result = await this.service.receiveBankTransfer(dto);
    return {
      success: true,
      message: result.duplicate ? "Duplicate webhook ignored" : "Webhook received"
    };
  }
}
