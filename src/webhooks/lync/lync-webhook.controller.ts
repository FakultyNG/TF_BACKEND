import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { IncomingHttpHeaders } from "http";
import { LyncWebhookService } from "./lync-webhook.service";

@ApiTags("Provider Webhooks")
@Controller("webhooks/lync")
export class LyncWebhookController {
  constructor(private readonly service: LyncWebhookService) {}

  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async receive(@Body() dto: Record<string, unknown>, @Headers() headers: IncomingHttpHeaders) {
    const result = await this.service.receive(dto, headers);
    return {
      success: true,
      message: result.duplicate ? "Duplicate webhook ignored" : "Webhook received"
    };
  }
}
