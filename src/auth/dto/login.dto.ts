import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "08103100000" })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: "12345" })
  @IsString()
  @Matches(/^\d{5}$/)
  passcode: string;
}
