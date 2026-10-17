import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class AdminDeleteUserDto {
  @ApiProperty({ example: "User requested permanent account deletion" })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;

  @ApiProperty({ example: "DELETE 2348012345678" })
  @IsString()
  @MaxLength(40)
  confirmation: string;
}
