import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { SupportAttachmentStorageService } from "./support-attachment-storage.service";
import { UploadsModule } from "../uploads/uploads.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, PrismaModule, UploadsModule, NotificationsModule],
  controllers: [SupportController],
  providers: [SupportService, SupportAttachmentStorageService],
  exports: [SupportService]
})
export class SupportModule {}
