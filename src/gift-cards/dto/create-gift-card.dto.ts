import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

export class CreateGiftCardDto {
  @ApiProperty({ example: "quote_gift_12345" })
  @IsString()
  @IsNotEmpty()
  quoteId: string;

  @ApiProperty({ example: "12345" })
  @IsString()
  @Matches(/^\d{5}$/)
  passcode: string;
}
