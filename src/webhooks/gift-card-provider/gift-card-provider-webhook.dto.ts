import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";

export class GiftCardProviderWebhookDto {
  @ApiPropertyOptional({ example: "gift_card.delivered" })
  @IsOptional()
  @IsString()
  event?: string;

  @ApiPropertyOptional({ example: "delivered" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: "gc_ref_123" })
  @IsOptional()
  @IsString()
  providerReference?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
