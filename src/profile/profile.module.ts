import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";
import { WalletModule } from "../wallet/wallet.module";

@Module({
  imports: [AuthModule, PrismaModule, WalletModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService]
})
export class ProfileModule {}
