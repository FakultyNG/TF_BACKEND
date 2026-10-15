import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, Matches, ValidateIf } from "class-validator";

export class ConfirmTransferDto {
  @ApiProperty({ example: "quote_ngn_12345" })
  @IsString()
  @IsNotEmpty()
  quoteId: string;

  @ApiPropertyOptional({ example: "12345" })
  @ValidateIf((value: ConfirmTransferDto) => !value.biometricDeviceId)
  @IsString()
  @Matches(/^\d{5}$/)
  passcode?: string;

  @ApiPropertyOptional({ example: "device_12345" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  biometricDeviceId?: string;

  @ApiPropertyOptional({ example: "TF Transfer" })
  @IsOptional()
  @IsString()
  narration?: string;

  @ApiPropertyOptional({ example: "supplier_payment" })
  @IsOptional()
  @IsString()
  purpose?: string;
}
