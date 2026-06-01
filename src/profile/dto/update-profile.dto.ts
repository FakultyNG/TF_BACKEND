import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: "John" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ example: "Musa" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ example: "test@test.com" })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: "1990-01-01" })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: "Male" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  gender?: string;

  @ApiPropertyOptional({ example: "https://cdn.tfapp.com/profile/usr_12345.jpg" })
  @IsOptional()
  @IsString()
  profileImageUrl?: string;
}
