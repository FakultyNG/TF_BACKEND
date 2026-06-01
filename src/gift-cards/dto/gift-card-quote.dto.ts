import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsString, Min } from "class-validator";

export class GiftCardQuoteDto {
  @ApiProperty({ example: "gift_reeplay_usd" })
  @IsString()
  @IsNotEmpty()
  giftCardId: string;

  @ApiProperty({ example: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ example: "USD" })
  @IsString()
  @IsNotEmpty()
  currency: string;
}
