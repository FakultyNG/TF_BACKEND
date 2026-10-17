import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class VerifyNinDto {
  @ApiProperty({ example: "12345678901" })
  @IsString()
  @Matches(/^\d{11}$/, { message: "NIN must be exactly 11 digits" })
  nin!: string;
}
