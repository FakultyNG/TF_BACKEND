import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class RegisterKycSelfieDto {
  @ApiProperty({ example: "reg_temp_abc123def456" })
  @IsString()
  @IsNotEmpty()
  registrationToken: string;

  @ApiProperty({ example: "kyc_ref_12345" })
  @IsString()
  @IsNotEmpty()
  kycReference: string;

  @ApiProperty({ example: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD..." })
  @IsString()
  @IsNotEmpty()
  selfieImageBase64: string;
}
