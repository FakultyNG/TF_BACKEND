import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class VerifyPasscodeDto {
  @ApiProperty({ example: "12345" })
  @IsString()
  @Matches(/^\d{5}$/)
  passcode: string;
}
