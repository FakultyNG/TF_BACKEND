import { Body, Controller, Headers, HttpCode, Post, Req } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { BytidWebhookService } from "./bytid-webhook.service";

type RawBodyRequest = Request & { rawBody?: Buffer };

@ApiTags("Provider Webhooks")
@Controller("webhooks/bytid")
export class BytidWebhookController {
  constructor(private readonly service: BytidWebhookService) {}

  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async receive(
    @Body() dto: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: RawBodyRequest
  ) {
    const result = await this.service.receive(dto, headers, request.rawBody);
    return {
      success: true,
      message: result.duplicate ? "Duplicate webhook ignored" : "Webhook received"
    };
  }
}
