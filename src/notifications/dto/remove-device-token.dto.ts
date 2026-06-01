import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class RemoveDeviceTokenDto {
  @ApiProperty({ example: "device_12345" })
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}
