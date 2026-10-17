import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";

export class BroadcastNotificationDto {
  @ApiProperty({ example: "Welcome to the new Transfa" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @ApiProperty({ example: "Your wallet experience just got better." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  @ApiPropertyOptional({ example: "tf://home" })
  @IsOptional()
  @IsString()
  deepLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;
}
