import { ApiPropertyOptional } from "@nestjs/swagger";
import { WalletStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class AdminUserOperationalUpdateDto {
  @ApiPropertyOptional({ enum: WalletStatus })
  @IsOptional()
  @IsEnum(WalletStatus)
  walletStatus?: WalletStatus;

  @ApiPropertyOptional({ example: "Customer asked for supplier payout support." })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  supportNotes?: string;

  @ApiPropertyOptional({ example: "Manual review required for high-value transfers." })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  riskNotes?: string;
}
