import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class ResendOtpDto {
  @ApiProperty({ example: "08103100000" })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: "otp_ref_12345" })
  @IsString()
  @IsNotEmpty()
  otpReference: string;
}
