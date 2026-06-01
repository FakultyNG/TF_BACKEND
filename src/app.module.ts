import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { KycModule } from "./kyc/kyc.module";
import { PasscodeModule } from "./passcode/passcode.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProvidersModule } from "./providers/providers.module";
import { RedisModule } from "./redis/redis.module";
import { UsersModule } from "./users/users.module";
import { OtpModule } from "./otp/otp.module";
import { RequestLoggerMiddleware } from "./common/middleware/request-logger.middleware";
import { WalletModule } from "./wallet/wallet.module";
import { TransfersModule } from "./transfers/transfers.module";
import { GiftCardsModule } from "./gift-cards/gift-cards.module";
import { SupportModule } from "./support/support.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { ProfileModule } from "./profile/profile.module";
import { BiometricsModule } from "./biometrics/biometrics.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { CashDropModule } from "./cash-drop/cash-drop.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { UploadsModule } from "./uploads/uploads.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    ProvidersModule,
    UsersModule,
    OtpModule,
    AuthModule,
    KycModule,
    PasscodeModule,
    WalletModule,
    TransfersModule,
    GiftCardsModule,
    SupportModule,
    TransactionsModule,
    ProfileModule,
    BiometricsModule,
    NotificationsModule,
    CashDropModule,
    WebhooksModule,
    UploadsModule,
    HealthModule,
    AdminModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*");
  }
}
