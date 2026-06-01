import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class VerifyFundingDto {
  @ApiProperty({ example: "TRFA_REF_12345" })
  @IsString()
  @IsNotEmpty()
  reference: string;
}
