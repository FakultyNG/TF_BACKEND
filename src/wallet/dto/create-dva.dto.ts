import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class CreateDvaDto {
  @ApiPropertyOptional({ example: "auto" })
  @IsOptional()
  @IsString()
  preferredBank?: string = "auto";
}
