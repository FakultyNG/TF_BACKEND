import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { AdminPaginationDto } from "./admin-pagination.dto";

export class AdminKycRecordQueryDto extends AdminPaginationDto {
  @ApiPropertyOptional({ example: "prembly" })
  @IsOptional()
  @IsString()
  provider?: string;
}
