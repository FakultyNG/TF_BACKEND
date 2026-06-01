import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { TransactionType } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class RecentBeneficiaryQueryDto {
  @ApiPropertyOptional({ enum: [TransactionType.ngn_transfer, TransactionType.usd_transfer, TransactionType.cny_transfer] })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ example: "1234" })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ type: Number, example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ type: Number, example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
