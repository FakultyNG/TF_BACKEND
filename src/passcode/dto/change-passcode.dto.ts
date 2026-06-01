import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class ChangePasscodeDto {
  @ApiProperty({ example: "12345" })
  @IsString()
  @Matches(/^\d{5}$/)
  oldPasscode: string;

  @ApiProperty({ example: "54321" })
  @IsString()
  @Matches(/^\d{5}$/)
  newPasscode: string;
}
