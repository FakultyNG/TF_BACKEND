import { ApiProperty } from "@nestjs/swagger";
import { BiometricMethod } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";

export class EnableBiometricDto {
  @ApiProperty({ enum: BiometricMethod, example: BiometricMethod.face_id })
  @IsEnum(BiometricMethod)
  method: BiometricMethod;

  @ApiProperty({ example: "device_12345" })
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}
