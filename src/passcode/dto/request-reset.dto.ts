import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class RequestResetDto {
  @ApiProperty({ example: "08103100000" })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}
