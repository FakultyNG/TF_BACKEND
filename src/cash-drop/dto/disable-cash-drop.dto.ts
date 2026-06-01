import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class DisableCashDropDto {
  @ApiPropertyOptional({ example: "User disabled CashDrop" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
