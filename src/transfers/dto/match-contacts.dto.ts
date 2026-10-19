import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, MaxLength } from "class-validator";

export class MatchContactsDto {
  @ApiProperty({ type: [String], description: "Phone numbers read from the signed-in user's device contacts" })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  phoneNumbers: string[];
}
