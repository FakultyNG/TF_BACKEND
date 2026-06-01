import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class SuggestNgnBanksDto {
  @ApiProperty({ example: "0123456789" })
  @IsString()
  @Matches(/^\d{10}$/)
  accountNumber: string;
}
