import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class ResolveCashDropDto {
  @ApiProperty({ example: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD..." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000_000)
  scannedImageBase64: string;
}
