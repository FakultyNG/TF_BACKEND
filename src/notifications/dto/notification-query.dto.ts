import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { PageLimitQueryDto } from "../../common/dto/pagination-query.dto";

export class NotificationQueryDto extends PageLimitQueryDto {
  @ApiPropertyOptional({ example: "security" })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: "security_alert" })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: "high" })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ type: Boolean, example: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  isRead?: boolean;
}
