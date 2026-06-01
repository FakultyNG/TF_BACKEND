import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";

export class DojahWebhookDto {
  @ApiPropertyOptional({ example: "kyc.verified" })
  @IsOptional()
  @IsString()
  event?: string;

  @ApiPropertyOptional({ example: "verified" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: "kyc_ref_123" })
  @IsOptional()
  @IsString()
  providerReference?: string;

  @ApiPropertyOptional({ example: "kyc_ref_123" })
  @IsOptional()
  @IsString()
  kycReference?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
