import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MockKycProvider } from "./adapters/mock-kyc.provider";
import { MockOtpProvider } from "./adapters/mock-otp.provider";
import { BytidModule } from "./bytid/bytid.module";
import { BytidKycProvider } from "./bytid/bytid.service";
import { MockGiftCardProvider } from "./gift-cards/mock-gift-card.provider";
import { LyncModule } from "./lync/lync.module";
import { LyncService, MockLyncProvider } from "./lync/lync.service";
import { PremblyModule } from "./prembly/prembly.module";
import { PremblyKycProvider } from "./prembly/prembly.service";
import { SendchampOtpProvider } from "./sendchamp/sendchamp-otp.provider";
import { StrowalletModule } from "./strowallet/strowallet.module";
import { StrowalletService } from "./strowallet/strowallet.service";
import {
  DVA_PROVIDER,
  FX_PAYOUT_PROVIDER,
  GIFT_CARD_PROVIDER,
  KYC_PROVIDER,
  NGN_TRANSFER_PROVIDER,
  OTP_PROVIDER,
  SELFIE_KYC_PROVIDER
} from "./provider.tokens";

const lyncProviderFactory = (config: ConfigService, lync: LyncService, mock: MockLyncProvider) =>
  ["1", "true", "yes", "on"].includes(config.get<string>("LYNC_ENABLED", "false").toLowerCase()) ? lync : mock;

const bankingProviderFactory = (config: ConfigService, strowallet: StrowalletService, lync: LyncService, mock: MockLyncProvider) => {
  const provider = config.get<string>("BANKING_PROVIDER", "strowallet").toLowerCase();
  if (provider === "strowallet") return strowallet;
  if (provider === "lync" || ["1", "true", "yes", "on"].includes(config.get<string>("LYNC_ENABLED", "false").toLowerCase())) return lync;
  return mock;
};

const kycProviderFactory = (config: ConfigService, strowallet: StrowalletService, prembly: PremblyKycProvider, mock: MockKycProvider) => {
  const provider = config.get<string>("KYC_PROVIDER", "strowallet").toLowerCase();
  if (provider === "strowallet") return strowallet;
  if (provider === "prembly") return prembly;
  return mock;
};

const selfieKycProviderFactory = (config: ConfigService, bytid: BytidKycProvider, strowallet: StrowalletService, prembly: PremblyKycProvider, mock: MockKycProvider) => {
  const provider = config.get<string>("SELFIE_KYC_PROVIDER", "bytid").toLowerCase();
  if (provider === "bytid") return bytid;
  if (provider === "strowallet") return strowallet;
  if (provider === "prembly") return prembly;
  return mock;
};

export const otpProviderFactory = (config: ConfigService, sendchamp: SendchampOtpProvider, mock: MockOtpProvider) => {
  const devMode = ["1", "true", "yes", "on"].includes(String(config.get<string>("OTP_DEV_MODE", "false")).toLowerCase());
  if (devMode) return mock;

  const provider = config.get<string>("OTP_PROVIDER", "").trim().toLowerCase();
  if (provider !== "sendchamp") {
    throw new Error("OTP_PROVIDER must be set to sendchamp when OTP_DEV_MODE is false");
  }
  if (!config.get<string>("SENDCHAMP_API_KEY", "").trim()) {
    throw new Error("SENDCHAMP_API_KEY is required when OTP_PROVIDER is sendchamp");
  }

  return sendchamp;
};

@Module({
  imports: [BytidModule, LyncModule, PremblyModule, StrowalletModule],
  providers: [
    MockOtpProvider,
    SendchampOtpProvider,
    {
      provide: OTP_PROVIDER,
      useFactory: otpProviderFactory,
      inject: [ConfigService, SendchampOtpProvider, MockOtpProvider]
    },
    MockKycProvider,
    {
      provide: KYC_PROVIDER,
      useFactory: kycProviderFactory,
      inject: [ConfigService, StrowalletService, PremblyKycProvider, MockKycProvider]
    },
    {
      provide: SELFIE_KYC_PROVIDER,
      useFactory: selfieKycProviderFactory,
      inject: [ConfigService, BytidKycProvider, StrowalletService, PremblyKycProvider, MockKycProvider]
    },
    {
      provide: DVA_PROVIDER,
      useFactory: bankingProviderFactory,
      inject: [ConfigService, StrowalletService, LyncService, MockLyncProvider]
    },
    {
      provide: NGN_TRANSFER_PROVIDER,
      useFactory: bankingProviderFactory,
      inject: [ConfigService, StrowalletService, LyncService, MockLyncProvider]
    },
    {
      provide: FX_PAYOUT_PROVIDER,
      useFactory: lyncProviderFactory,
      inject: [ConfigService, LyncService, MockLyncProvider]
    },
    { provide: GIFT_CARD_PROVIDER, useClass: MockGiftCardProvider }
  ],
  exports: [OTP_PROVIDER, KYC_PROVIDER, SELFIE_KYC_PROVIDER, DVA_PROVIDER, NGN_TRANSFER_PROVIDER, FX_PAYOUT_PROVIDER, GIFT_CARD_PROVIDER]
})
export class ProvidersModule {}
