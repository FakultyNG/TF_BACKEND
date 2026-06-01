import { ApiProperty } from "@nestjs/swagger";
import { KycStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateKycStatusDto {
  @ApiProperty({ enum: KycStatus, example: KycStatus.verified })
  @IsEnum(KycStatus)
  status: KycStatus;
}
