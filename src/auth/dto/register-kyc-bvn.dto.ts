import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

export class RegisterKycBvnDto {
  @ApiProperty({ example: "reg_temp_abc123def456" })
  @IsString()
  @IsNotEmpty()
  registrationToken: string;

  @ApiProperty({ example: "12345678901" })
  @IsString()
  @Matches(/^\d{11}$/)
  bvn: string;
}
