import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";

export class PayoutProviderWebhookDto {
  @ApiPropertyOptional({ example: "payout.failed" })
  @IsOptional()
  @IsString()
  event?: string;

  @ApiPropertyOptional({ example: "failed" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: "payout_ref_123" })
  @IsOptional()
  @IsString()
  providerReference?: string;

  @ApiPropertyOptional({ example: "USD" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
