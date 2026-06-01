import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { AdminCashDropController } from "./admin-cash-drop.controller";
import { CashDropController } from "./cash-drop.controller";
import { CashDropFingerprintService } from "./cash-drop-fingerprint.service";
import { CashDropService } from "./cash-drop.service";

@Module({
  imports: [AuthModule, PrismaModule, RedisModule],
  controllers: [CashDropController, AdminCashDropController],
  providers: [CashDropService, CashDropFingerprintService],
  exports: [CashDropService]
})
export class CashDropModule {}
