import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PricingModule } from "../pricing/pricing.module";
import { ProvidersModule } from "../providers/providers.module";
import { RedisModule } from "../redis/redis.module";
import { WalletModule } from "../wallet/wallet.module";
import { GiftCardsController } from "./gift-cards.controller";
import { GiftCardsService } from "./gift-cards.service";
import { GiftCardCodeCipher } from "./gift-card-code-cipher.service";

@Module({
  imports: [AuthModule, PricingModule, ProvidersModule, RedisModule, WalletModule],
  controllers: [GiftCardsController],
  providers: [GiftCardsService, GiftCardCodeCipher],
  exports: [GiftCardsService, GiftCardCodeCipher]
})
export class GiftCardsModule {}
