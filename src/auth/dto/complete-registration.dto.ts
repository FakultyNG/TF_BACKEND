import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

export class CompleteRegistrationDto {
  @ApiProperty({ example: "reg_temp_12345" })
  @IsString()
  @IsNotEmpty()
  registrationToken: string;

  @ApiProperty({ example: "12345" })
  @IsString()
  @Matches(/^\d{5}$/)
  passcode: string;
}
