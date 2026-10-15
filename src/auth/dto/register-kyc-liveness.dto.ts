import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class RegisterKycLivenessDto {
  @ApiProperty({ example: "reg_temp_abc123def456" })
  @IsString()
  @IsNotEmpty()
  registrationToken: string;

  @ApiProperty({ example: "kyc_ref_12345" })
  @IsString()
  @IsNotEmpty()
  kycReference: string;
}

export class RegisterKycLivenessStatusDto extends RegisterKycLivenessDto {
  @ApiProperty({ example: "5f1d9c2a-3b7e-4c0d-8a6f-2e9b1c4d7a30" })
  @IsString()
  @IsNotEmpty()
  livenessSessionId: string;
}

export class CompleteRegisterKycLivenessDto extends RegisterKycLivenessStatusDto {
  @ApiProperty({ example: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD..." })
  @IsString()
  @IsNotEmpty()
  profileImageBase64: string;
}
