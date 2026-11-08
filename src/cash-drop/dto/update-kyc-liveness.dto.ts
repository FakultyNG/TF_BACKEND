import { IsBoolean } from "class-validator";

export class UpdateKycLivenessDto {
  @IsBoolean()
  enabled: boolean;
}
