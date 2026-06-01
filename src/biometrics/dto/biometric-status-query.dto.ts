import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class BiometricStatusQueryDto {
  @ApiPropertyOptional({ example: "device_12345" })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
