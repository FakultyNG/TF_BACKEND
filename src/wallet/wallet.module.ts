import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProvidersModule } from "../providers/providers.module";
import { UsersModule } from "../users/users.module";
import { FundingController } from "./funding.controller";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";

@Module({
  imports: [AuthModule, ProvidersModule, UsersModule],
  controllers: [WalletController, FundingController],
  providers: [WalletService],
  exports: [WalletService]
})
export class WalletModule {}
