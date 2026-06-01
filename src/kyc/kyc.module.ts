import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { ProvidersModule } from "../providers/providers.module";
import { RedisModule } from "../redis/redis.module";
import { WalletModule } from "../wallet/wallet.module";
import { CashDropModule } from "../cash-drop/cash-drop.module";
import { UploadsModule } from "../uploads/uploads.module";
import { KycController } from "./kyc.controller";
import { KycService } from "./kyc.service";

@Module({
  imports: [ProvidersModule, AuthModule, RedisModule, ConfigModule, WalletModule, CashDropModule, UploadsModule],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService]
})
export class KycModule {}
