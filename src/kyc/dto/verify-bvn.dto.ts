import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class VerifyBvnDto {
  @ApiProperty({ example: "12345678901" })
  @IsString()
  @Matches(/^\d{11}$/)
  bvn: string;
}
