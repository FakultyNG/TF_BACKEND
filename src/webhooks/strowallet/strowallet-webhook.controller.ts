import { Body, Controller, Get, HttpCode, Logger, Post } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { StrowalletWebhookService } from "./strowallet-webhook.service";

@ApiTags("Provider Webhooks")
@Controller("webhooks/strowallet")
export class StrowalletWebhookController {
  private readonly logger = new Logger(StrowalletWebhookController.name);

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

  @Get("bank-transfer")
  @HttpCode(200)
  @ApiExcludeEndpoint()
  bankTransferHealth() {
    return { success: true, message: "Strowallet bank-transfer webhook is ready" };
  }

  @Post("bank-transfer")
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async receiveBankTransfer(@Body() dto: Record<string, unknown>) {
    try {
      const result = await this.service.receiveBankTransfer(dto);
      return {
        success: true,
        message: result.duplicate
          ? "Duplicate webhook ignored"
          : "accepted" in result && result.accepted === false
          ? "Webhook received but could not be verified"
          : "Webhook received"
      };
    } catch (error) {
      this.logger.error(
        "Strowallet bank-transfer webhook was acknowledged after processing failed",
        error instanceof Error ? error.stack : undefined
      );
      return { success: true, message: "Webhook received" };
    }
  }
}
