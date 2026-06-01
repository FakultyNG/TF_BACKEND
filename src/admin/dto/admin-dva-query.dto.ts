import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { DvaStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class AdminDvaQueryDto {
  @ApiPropertyOptional({ type: Number, example: 50, default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 50;

  @ApiPropertyOptional({ type: Number, example: 0, default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiPropertyOptional({ example: "Wema" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: "mock_lync" })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ enum: DvaStatus })
  @IsOptional()
  @IsEnum(DvaStatus)
  status?: DvaStatus;
}
