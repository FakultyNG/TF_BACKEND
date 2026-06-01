import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

export class CompleteResetDto {
  @ApiProperty({ example: "reset_temp_12345" })
  @IsString()
  @IsNotEmpty()
  resetToken: string;

  @ApiProperty({ example: "54321" })
  @IsString()
  @Matches(/^\d{5}$/)
  newPasscode: string;
}
