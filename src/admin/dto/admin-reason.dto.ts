import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class AdminReasonDto {
  @ApiPropertyOptional({ example: "Manual review approved" })
  @IsOptional()
  @IsString()
  reason?: string;
}
