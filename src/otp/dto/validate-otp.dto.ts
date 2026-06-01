import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Length, Matches } from "class-validator";

export class ValidateOtpDto {
  @ApiProperty({ example: "08103100000" })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  otp: string;

  @ApiProperty({ example: "otp_ref_12345" })
  @IsString()
  @IsNotEmpty()
  otpReference: string;
}
