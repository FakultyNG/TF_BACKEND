import { ApiPropertyOptional } from "@nestjs/swagger";
import { AccountTier, WalletStatus } from "@prisma/client";
import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class AdminUpdateUserDto {
  @ApiPropertyOptional({ example: "2348012345678" })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

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

  @ApiPropertyOptional({ example: "john@example.com" })
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

  @ApiPropertyOptional({ example: "Nigeria" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @ApiPropertyOptional({ example: "https://cdn.example.com/customer.jpg" })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  profileImageUrl?: string;

  @ApiPropertyOptional({ enum: AccountTier })
  @IsOptional()
  @IsEnum(AccountTier)
  accountTier?: AccountTier;

  @ApiPropertyOptional({ enum: WalletStatus })
  @IsOptional()
  @IsEnum(WalletStatus)
  walletStatus?: WalletStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  supportNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  riskNotes?: string;
}
