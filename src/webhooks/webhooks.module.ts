import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WalletModule } from "../wallet/wallet.module";
import { CashDropModule } from "../cash-drop/cash-drop.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { GiftCardsModule } from "../gift-cards/gift-cards.module";
import { AdminWebhooksController } from "./admin-webhooks.controller";
import { AdminWebhooksService } from "./admin-webhooks.service";
import { WebhookLogService } from "./common/webhook-log.service";
import { WebhookSignatureService } from "./common/webhook-signature.service";
import { DojahWebhookController } from "./dojah/dojah-webhook.controller";
import { DojahWebhookService } from "./dojah/dojah-webhook.service";
import { GiftCardProviderWebhookController } from "./gift-card-provider/gift-card-provider-webhook.controller";
import { GiftCardProviderWebhookService } from "./gift-card-provider/gift-card-provider-webhook.service";
import { LyncDvaHandler } from "./lync/handlers/lync-dva.handler";
import { LyncFundingHandler } from "./lync/handlers/lync-funding.handler";
import { LyncNgnTransferHandler } from "./lync/handlers/lync-ngn-transfer.handler";
import { LyncPayoutHandler } from "./lync/handlers/lync-payout.handler";
import { LyncWebhookController } from "./lync/lync-webhook.controller";
import { LyncWebhookService } from "./lync/lync-webhook.service";
import { PremblyWebhookController } from "./prembly/prembly-webhook.controller";
import { PremblyWebhookService } from "./prembly/prembly-webhook.service";
import { PayoutProviderWebhookController } from "./payout-provider/payout-provider-webhook.controller";
import { PayoutProviderWebhookService } from "./payout-provider/payout-provider-webhook.service";
import { SendchampWebhookController } from "./sendchamp/sendchamp-webhook.controller";
import { SendchampWebhookService } from "./sendchamp/sendchamp-webhook.service";

@Module({
  imports: [
    AuthModule,
    WalletModule,
    CashDropModule,
    NotificationsModule,
    GiftCardsModule
  ],
  controllers: [
    LyncWebhookController,
    DojahWebhookController,
    PremblyWebhookController,
    PayoutProviderWebhookController,
    GiftCardProviderWebhookController,
    SendchampWebhookController,
    AdminWebhooksController
  ],
  providers: [
    WebhookSignatureService,
    WebhookLogService,
    LyncDvaHandler,
    LyncFundingHandler,
    LyncNgnTransferHandler,
    LyncPayoutHandler,
    LyncWebhookService,
    DojahWebhookService,
    PremblyWebhookService,
    PayoutProviderWebhookService,
    GiftCardProviderWebhookService,
    SendchampWebhookService,
    AdminWebhooksService
  ],
  exports: [WebhookLogService]
})
export class WebhooksModule {}
