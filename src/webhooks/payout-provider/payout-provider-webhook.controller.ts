import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { IncomingHttpHeaders } from "http";
import { PayoutProviderWebhookService } from "./payout-provider-webhook.service";

@ApiTags("Provider Webhooks")
@Controller("webhooks/payout-provider")
export class PayoutProviderWebhookController {
  constructor(private readonly service: PayoutProviderWebhookService) {}

  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async receive(@Body() dto: Record<string, unknown>, @Headers() headers: IncomingHttpHeaders) {
    const result = await this.service.receive(dto, headers);
    return { success: true, message: result.duplicate ? "Duplicate webhook ignored" : "Webhook received" };
  }
}
