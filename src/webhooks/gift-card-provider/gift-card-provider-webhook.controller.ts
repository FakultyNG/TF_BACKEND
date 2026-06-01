import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { IncomingHttpHeaders } from "http";
import { GiftCardProviderWebhookService } from "./gift-card-provider-webhook.service";

@ApiTags("Provider Webhooks")
@Controller("webhooks/reeplay")
export class GiftCardProviderWebhookController {
  constructor(private readonly service: GiftCardProviderWebhookService) {}

  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async receive(@Body() dto: Record<string, unknown>, @Headers() headers: IncomingHttpHeaders) {
    const result = await this.service.receive(dto, headers);
    return { success: true, message: result.duplicate ? "Duplicate webhook ignored" : "Webhook received" };
  }
}
