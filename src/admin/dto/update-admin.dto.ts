import { ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { ADMIN_PERMISSIONS } from "../admin-permissions";

export class UpdateAdminDto {
  @ApiPropertyOptional({ enum: [UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE] })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: ADMIN_PERMISSIONS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ADMIN_PERMISSIONS, { each: true })
  permissions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: "Ada" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ example: "Okafor" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ example: "48291" })
  @IsOptional()
  @Matches(/^\d{5}$/)
  passcode?: string;
}
