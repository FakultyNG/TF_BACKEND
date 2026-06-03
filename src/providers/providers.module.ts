import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MockKycProvider } from "./adapters/mock-kyc.provider";
import { MockOtpProvider } from "./adapters/mock-otp.provider";
import { MockGiftCardProvider } from "./gift-cards/mock-gift-card.provider";
import { LyncModule } from "./lync/lync.module";
import { LyncService, MockLyncProvider } from "./lync/lync.service";
import { PremblyModule } from "./prembly/prembly.module";
import { PremblyKycProvider } from "./prembly/prembly.service";
import {
  DVA_PROVIDER,
  FX_PAYOUT_PROVIDER,
  GIFT_CARD_PROVIDER,
  KYC_PROVIDER,
  NGN_TRANSFER_PROVIDER,
  OTP_PROVIDER
} from "./provider.tokens";

const lyncProviderFactory = (config: ConfigService, lync: LyncService, mock: MockLyncProvider) =>
  ["1", "true", "yes", "on"].includes(config.get<string>("LYNC_ENABLED", "false").toLowerCase()) ? lync : mock;

const kycProviderFactory = (config: ConfigService, prembly: PremblyKycProvider, mock: MockKycProvider) =>
  config.get<string>("KYC_PROVIDER", "mock").toLowerCase() === "prembly" ? prembly : mock;

@Module({
  imports: [LyncModule, PremblyModule],
  providers: [
    { provide: OTP_PROVIDER, useClass: MockOtpProvider },
    {
      provide: KYC_PROVIDER,
      useFactory: kycProviderFactory,
      inject: [ConfigService, PremblyKycProvider, MockKycProvider]
    },
    {
      provide: DVA_PROVIDER,
      useFactory: lyncProviderFactory,
      inject: [ConfigService, LyncService, MockLyncProvider]
    },
    {
      provide: NGN_TRANSFER_PROVIDER,
      useFactory: lyncProviderFactory,
      inject: [ConfigService, LyncService, MockLyncProvider]
    },
    {
      provide: FX_PAYOUT_PROVIDER,
      useFactory: lyncProviderFactory,
      inject: [ConfigService, LyncService, MockLyncProvider]
    },
    { provide: GIFT_CARD_PROVIDER, useClass: MockGiftCardProvider }
  ],
  exports: [OTP_PROVIDER, KYC_PROVIDER, DVA_PROVIDER, NGN_TRANSFER_PROVIDER, FX_PAYOUT_PROVIDER, GIFT_CARD_PROVIDER]
})
export class ProvidersModule {}
