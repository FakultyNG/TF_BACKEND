import { Module } from "@nestjs/common";
import { MockKycProvider } from "./adapters/mock-kyc.provider";
import { MockOtpProvider } from "./adapters/mock-otp.provider";
import { MockDvaProvider } from "./dva/mock-dva.provider";
import { MockFxPayoutProvider } from "./fx-payout/mock-fx-payout.provider";
import { MockGiftCardProvider } from "./gift-cards/mock-gift-card.provider";
import { MockNgnTransferProvider } from "./transfers/mock-ngn-transfer.provider";
import {
  DVA_PROVIDER,
  FX_PAYOUT_PROVIDER,
  GIFT_CARD_PROVIDER,
  KYC_PROVIDER,
  NGN_TRANSFER_PROVIDER,
  OTP_PROVIDER
} from "./provider.tokens";

@Module({
  providers: [
    { provide: OTP_PROVIDER, useClass: MockOtpProvider },
    { provide: KYC_PROVIDER, useClass: MockKycProvider },
    { provide: DVA_PROVIDER, useClass: MockDvaProvider },
    { provide: NGN_TRANSFER_PROVIDER, useClass: MockNgnTransferProvider },
    { provide: FX_PAYOUT_PROVIDER, useClass: MockFxPayoutProvider },
    { provide: GIFT_CARD_PROVIDER, useClass: MockGiftCardProvider }
  ],
  exports: [OTP_PROVIDER, KYC_PROVIDER, DVA_PROVIDER, NGN_TRANSFER_PROVIDER, FX_PAYOUT_PROVIDER, GIFT_CARD_PROVIDER]
})
export class ProvidersModule {}
