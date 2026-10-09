import { ApiPropertyOptional } from "@nestjs/swagger";
import { GiftCardPurchaseStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";
import { PageLimitQueryDto } from "../../common/dto/pagination-query.dto";

export class GiftCardPurchaseQueryDto extends PageLimitQueryDto {
  @ApiPropertyOptional({ enum: GiftCardPurchaseStatus })
  @IsOptional()
  @IsEnum(GiftCardPurchaseStatus)
  status?: GiftCardPurchaseStatus;
}
