import { ApiProperty } from "@nestjs/swagger";
import { IsObject } from "class-validator";

export class UpdateFeeConfigDto {
  @ApiProperty({
    examples: [
      { fee: { mode: "fixed", fixedFee: 100 } },
      { fee: { mode: "percentage", percentageBps: 50, minFee: 50, maxFee: 500 } },
      {
        fxRate: 1650,
        providerFee: { mode: "fixed", fixedFee: 2500 },
        tfFee: { mode: "percentage", percentageBps: 50, minFee: 1000, maxFee: 5000 },
        estimatedSettlementTime: "1-3 business days"
      },
      { usdFxRate: 1680, cnyFxRate: 230, fee: { mode: "fixed", fixedFee: 1000 } }
    ]
  })
  @IsObject()
  config: Record<string, unknown>;
}
