import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { CloudinaryService } from "./cloudinary.service";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [AuthModule, PrismaModule, RedisModule],
  controllers: [UploadsController],
  providers: [CloudinaryService, UploadsService],
  exports: [CloudinaryService, UploadsService]
})
export class UploadsModule {}
