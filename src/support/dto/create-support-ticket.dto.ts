import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, ArrayMaxSize } from "class-validator";

export class CreateSupportTicketDto {
  @ApiPropertyOptional({ example: "txn_usd_001" })
  @IsOptional()
  @IsString()
  transactionId?: string;

  @ApiPropertyOptional({ example: "transfer" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiProperty({ example: "Recipient has not received payment" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  subject: string;

  @ApiProperty({ example: "The transfer is still pending after 24 hours." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  @ApiPropertyOptional({ example: ["https://res.cloudinary.com/demo/image/upload/tf/support/attachments/receipt.png"] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  attachmentUrls?: string[];
}
