import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { ArrayUnique, IsArray, IsEmail, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { ADMIN_PERMISSIONS } from "../admin-permissions";

export class CreateAdminDto {
  @ApiProperty({ example: "2348012345678" })
  @IsString()
  phoneNumber: string;

  @ApiProperty({ example: "48291" })
  @Matches(/^\d{5}$/)
  passcode: string;

  @ApiProperty({ example: "Ada" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @ApiProperty({ example: "Okafor" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @ApiPropertyOptional({ example: "ada@transfa.app" })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ enum: [UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE] })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ enum: ADMIN_PERMISSIONS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(ADMIN_PERMISSIONS, { each: true })
  permissions: string[];
}
