import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, IsNotEmpty, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class AdminWalletAdjustDto {
  @ApiProperty({ example: "credit", enum: ["credit", "debit"] })
  @IsIn(["credit", "debit"])
  direction: "credit" | "debit";

  @ApiProperty({ example: 50000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ example: "Manual correction" })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
