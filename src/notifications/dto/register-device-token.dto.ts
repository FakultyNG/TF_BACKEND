import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";

export enum DevicePlatform {
  android = "android",
  ios = "ios",
  web = "web"
}

export class RegisterDeviceTokenDto {
  @ApiProperty({ example: "device_12345" })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiProperty({ example: "firebase_device_token" })
  @IsString()
  @IsNotEmpty()
  fcmToken: string;

  @ApiProperty({ enum: DevicePlatform, example: DevicePlatform.android })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;
}
