import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class BiometricLoginDto {
  @ApiProperty({ example: "device_12345" })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiPropertyOptional({ example: "local_auth_success_session" })
  @IsOptional()
  @IsString()
  localAuthProof?: string;
}
