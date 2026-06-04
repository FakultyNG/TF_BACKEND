import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class VerifyBvnDto {
  @ApiPropertyOptional({
    example: "reg_temp_abc123def456",
    description: "Required for pre-registration KYC. Omit only for legacy authenticated KYC."
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  registrationToken?: string;

  @ApiProperty({ example: "12345678901" })
  @IsString()
  @Matches(/^\d{11}$/)
  bvn: string;
}
