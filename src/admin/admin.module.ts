import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { KycModule } from "../kyc/kyc.module";
import { UsersModule } from "../users/users.module";
import { WalletModule } from "../wallet/wallet.module";
import { TransfersModule } from "../transfers/transfers.module";
import { GiftCardsModule } from "../gift-cards/gift-cards.module";
import { PricingModule } from "../pricing/pricing.module";
import { SupportModule } from "../support/support.module";
import { ProfileModule } from "../profile/profile.module";
import { BiometricsModule } from "../biometrics/biometrics.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminController } from "./admin.controller";
import { AdminNotificationsController } from "./admin-notifications.controller";
import { AdminService } from "./admin.service";
import { AdminSupportController } from "./admin-support.controller";
import { AdminUsersExtraController } from "./admin-users-extra.controller";

@Module({
  imports: [AuthModule, UsersModule, KycModule, WalletModule, TransfersModule, GiftCardsModule, PricingModule, SupportModule, ProfileModule, BiometricsModule, NotificationsModule],
  controllers: [AdminController, AdminSupportController, AdminUsersExtraController, AdminNotificationsController],
  providers: [AdminService]
})
export class AdminModule {}
