import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class SelfieValidateDto {
  @ApiPropertyOptional({
    example: "reg_temp_abc123def456",
    description: "Required for pre-registration KYC. Omit only for legacy authenticated KYC."
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  registrationToken?: string;

  @ApiProperty({ example: "kyc_ref_12345" })
  @IsString()
  @IsNotEmpty()
  kycReference: string;

  @ApiProperty({ example: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD..." })
  @IsString()
  @IsNotEmpty()
  selfieImageBase64: string;
}
