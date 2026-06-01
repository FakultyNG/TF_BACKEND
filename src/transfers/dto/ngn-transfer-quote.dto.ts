import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from "class-validator";

export class NgnTransferQuoteDto {
  @ApiProperty({ example: "044" })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ example: "0123456789" })
  @IsString()
  @Matches(/^\d{10}$/)
  accountNumber: string;

  @ApiProperty({ example: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ example: "TF Transfer" })
  @IsOptional()
  @IsString()
  narration?: string;
}
