import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PricingModule } from "../pricing/pricing.module";
import { ProvidersModule } from "../providers/providers.module";
import { RedisModule } from "../redis/redis.module";
import { WalletModule } from "../wallet/wallet.module";
import { TransfersController } from "./transfers.controller";
import { TransfersService } from "./transfers.service";
import { RecentBeneficiariesController } from "./recent-beneficiaries.controller";
import { RecentBeneficiariesService } from "./recent-beneficiaries.service";

@Module({
  imports: [AuthModule, PricingModule, ProvidersModule, RedisModule, WalletModule],
  controllers: [TransfersController, RecentBeneficiariesController],
  providers: [TransfersService, RecentBeneficiariesService],
  exports: [TransfersService, RecentBeneficiariesService]
})
export class TransfersModule {}
