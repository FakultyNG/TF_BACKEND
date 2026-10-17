import { IsNotEmpty, IsString, Length } from "class-validator";

export class ConfirmNinOtpDto {
  @IsString()
  @IsNotEmpty()
  otpReference!: string;

  @IsString()
  @Length(4, 8)
  otp!: string;
}

export class ResendNinOtpDto {
  @IsString()
  @IsNotEmpty()
  otpReference!: string;
}
