import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class RegisterCashDropDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  useCurrentProfileImage: boolean;
}
