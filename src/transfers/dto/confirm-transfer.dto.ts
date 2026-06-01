import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class ConfirmTransferDto {
  @ApiProperty({ example: "quote_ngn_12345" })
  @IsString()
  @IsNotEmpty()
  quoteId: string;

  @ApiProperty({ example: "12345" })
  @IsString()
  @Matches(/^\d{5}$/)
  passcode: string;

  @ApiPropertyOptional({ example: "TF Transfer" })
  @IsOptional()
  @IsString()
  narration?: string;

  @ApiPropertyOptional({ example: "supplier_payment" })
  @IsOptional()
  @IsString()
  purpose?: string;
}
