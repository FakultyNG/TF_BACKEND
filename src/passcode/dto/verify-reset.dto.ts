import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

export class VerifyResetDto {
  @ApiProperty({ example: "08103100000" })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @Matches(/^\d{6}$/)
  otp: string;

  @ApiProperty({ example: "otp_ref_x7ab92" })
  @IsString()
  @IsNotEmpty()
  otpReference: string;
}
