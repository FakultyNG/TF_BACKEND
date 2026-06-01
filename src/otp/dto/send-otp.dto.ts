import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsPhoneNumber, IsString } from "class-validator";

export class SendOtpDto {
  @ApiProperty({ example: "08103100000" })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}
