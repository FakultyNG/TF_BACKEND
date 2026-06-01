import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class WebhookLogQueryDto {
  @ApiPropertyOptional({ type: Number, example: 50, default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 50;

  @ApiPropertyOptional({ type: Number, example: 0, default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiPropertyOptional({ example: "lync" })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ example: "wallet_funding.successful" })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ example: "failed" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: "lnc_ref_123" })
  @IsOptional()
  @IsString()
  providerReference?: string;

  @ApiPropertyOptional({ example: "2026-05-01T00:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: "2026-05-31T23:59:59.000Z" })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
