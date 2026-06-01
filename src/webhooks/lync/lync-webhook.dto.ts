import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsObject, IsOptional, IsString } from "class-validator";

export class LyncWebhookDto {
  @ApiPropertyOptional({ example: "wallet_funding.successful" })
  @IsOptional()
  @IsString()
  event?: string;

  @ApiPropertyOptional({ example: "successful" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: "lnc_ref_123" })
  @IsOptional()
  @IsString()
  providerReference?: string;

  @ApiPropertyOptional({ example: "fund_123" })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: "NGN" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: "1234567890" })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
