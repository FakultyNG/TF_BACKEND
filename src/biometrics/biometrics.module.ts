import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { BiometricsController } from "./biometrics.controller";
import { BiometricsService } from "./biometrics.service";

@Module({
  imports: [AuthModule, PrismaModule, RedisModule],
  controllers: [BiometricsController],
  providers: [BiometricsService],
  exports: [BiometricsService]
})
export class BiometricsModule {}
