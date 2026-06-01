import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class ReplySupportTicketDto {
  @ApiProperty({ example: "Any update on this issue?" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  @ApiPropertyOptional({ example: "https://cdn.tfapp.com/support/attachment.png" })
  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @ApiPropertyOptional({ example: ["https://res.cloudinary.com/demo/image/upload/tf/support/attachments/receipt.png"] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  attachmentUrls?: string[];
}
