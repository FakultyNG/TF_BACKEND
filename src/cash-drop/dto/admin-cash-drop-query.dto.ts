import { ApiPropertyOptional } from "@nestjs/swagger";
import { CashDropProfileStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PageLimitQueryDto } from "../../common/dto/pagination-query.dto";

export class AdminCashDropQueryDto extends PageLimitQueryDto {
  @ApiPropertyOptional({ enum: CashDropProfileStatus })
  @IsOptional()
  @IsEnum(CashDropProfileStatus)
  status?: CashDropProfileStatus;

  @ApiPropertyOptional({ example: "usr_12345" })
  @IsOptional()
  @IsString()
  userId?: string;
}
