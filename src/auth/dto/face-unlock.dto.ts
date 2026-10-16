import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class FaceUnlockDto {
  @ApiProperty({ example: "08103100000" })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD..." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000_000)
  faceImageBase64: string;
}
