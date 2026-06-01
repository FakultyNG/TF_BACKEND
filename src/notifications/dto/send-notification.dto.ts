import { ApiProperty } from "@nestjs/swagger";
import { NotificationAudience } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class SendNotificationDto {
  @ApiProperty({ enum: NotificationAudience, example: NotificationAudience.all_users })
  @IsEnum(NotificationAudience)
  audience: NotificationAudience;

  @IsOptional()
  @IsString()
  targetUserId?: string;

  @IsOptional()
  @IsString()
  segment?: string;
}
