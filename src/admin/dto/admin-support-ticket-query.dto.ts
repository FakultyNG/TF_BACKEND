import { ApiPropertyOptional } from "@nestjs/swagger";
import { SupportTicketStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PageLimitQueryDto } from "../../common/dto/pagination-query.dto";

export class AdminSupportTicketQueryDto extends PageLimitQueryDto {
  @ApiPropertyOptional({ enum: SupportTicketStatus })
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @ApiPropertyOptional({ example: "transfer" })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: "usr_12345" })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ example: "admin_12345" })
  @IsOptional()
  @IsString()
  assignedAdminId?: string;
}
