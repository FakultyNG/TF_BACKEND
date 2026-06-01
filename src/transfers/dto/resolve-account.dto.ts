import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

export class ResolveAccountDto {
  @ApiProperty({ example: "044" })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ example: "0123456789" })
  @IsString()
  @Matches(/^\d{10}$/)
  accountNumber: string;
}
