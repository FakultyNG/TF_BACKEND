import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

export class AdminLoginDto {
  @ApiProperty({ example: "2348000000000" })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: "12345" })
  @IsString()
  @Matches(/^\d{5}$/)
  passcode: string;
}
