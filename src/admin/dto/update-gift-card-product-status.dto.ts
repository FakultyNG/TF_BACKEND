import { ApiProperty } from "@nestjs/swagger";
import { GiftCardProductStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateGiftCardProductStatusDto {
  @ApiProperty({ enum: GiftCardProductStatus, example: GiftCardProductStatus.active })
  @IsEnum(GiftCardProductStatus)
  status: GiftCardProductStatus;
}
