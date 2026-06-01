import { ApiPropertyOptional } from "@nestjs/swagger";
import { TransactionStatus, TransactionType } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { PageLimitQueryDto } from "../../common/dto/pagination-query.dto";

export class TransactionQueryDto extends PageLimitQueryDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ enum: TransactionStatus })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({ example: "NGN" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: "2026-05-01T00:00:00Z" })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: "2026-05-31T23:59:59Z" })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
