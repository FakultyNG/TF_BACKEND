import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NotificationAudience, NotificationStatus } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateNotificationDto {
  @ApiProperty({ example: "Software Update" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @ApiProperty({ example: "Transfa 1.5 introduces vendor lists." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  @ApiProperty({ example: "update" })
  @IsString()
  @IsNotEmpty()
  notificationCategory: string;

  @ApiProperty({ example: "app_update" })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({ example: "normal" })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ example: "https://tfapp.com/update-banner.png" })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: "#1F8A70" })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: "tf://wallet" })
  @IsOptional()
  @IsString()
  deepLink?: string;

  @ApiPropertyOptional({ example: "Get Transfa" })
  @IsOptional()
  @IsString()
  ctaText?: string;

  @ApiPropertyOptional({ example: "https://appstore.com/tf" })
  @IsOptional()
  @IsString()
  ctaUrl?: string;

  @ApiPropertyOptional({ enum: NotificationAudience, example: NotificationAudience.specific_user })
  @IsOptional()
  @IsEnum(NotificationAudience)
  audience?: NotificationAudience;

  @ApiPropertyOptional({ example: "usr_12345" })
  @IsOptional()
  @IsString()
  targetUserId?: string;

  @ApiPropertyOptional({ example: "verified_users" })
  @IsOptional()
  @IsString()
  segment?: string;

  @ApiPropertyOptional({ enum: NotificationStatus, example: NotificationStatus.draft })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;
}
