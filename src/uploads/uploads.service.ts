import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CloudinaryService, UploadFileInput } from "./cloudinary.service";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_MAX_SIZE = 2 * 1024 * 1024;

@Injectable()
export class UploadsService {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  async uploadProfileImage(userId: string, file: UploadFileInput) {
    const uploaded = await this.cloudinary.uploadFile(file, {
      folder: "tf/users/profile-images",
      allowedMimeTypes: IMAGE_TYPES,
      maxSizeBytes: IMAGE_MAX_SIZE,
      fallbackPrefix: "profile"
    });
    await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, profileImageUrl: uploaded.secureUrl },
      update: { profileImageUrl: uploaded.secureUrl }
    });
    return { profileImageUrl: uploaded.secureUrl, ...uploaded };
  }

  async uploadKycSelfie(userId: string, file: UploadFileInput) {
    const uploaded = await this.cloudinary.uploadFile(file, {
      folder: "tf/users/kyc-selfies",
      allowedMimeTypes: IMAGE_TYPES,
      maxSizeBytes: IMAGE_MAX_SIZE,
      fallbackPrefix: "kyc_selfie"
    });
    await this.redis.setJson(`kyc-selfie-upload:${uploaded.uploadId}`, { userId, selfieImageUrl: uploaded.secureUrl }, 900);
    return { ...uploaded, selfieImageUrl: uploaded.secureUrl };
  }

  async uploadSupportAttachment(userId: string, file: UploadFileInput) {
    const uploaded = await this.cloudinary.uploadFile(file, {
      folder: "tf/support/attachments",
      allowedMimeTypes: IMAGE_TYPES,
      maxSizeBytes: IMAGE_MAX_SIZE,
      fallbackPrefix: "support"
    });
    await this.prisma.supportAttachment.create({
      data: {
        userId,
        url: uploaded.secureUrl,
        fileName: uploaded.fileName,
        fileType: uploaded.fileType,
        fileSize: uploaded.fileSize,
        storageProvider: "cloudinary"
      }
    });
    return uploaded;
  }

  async uploadNotificationImage(adminId: string, file: UploadFileInput) {
    const uploaded = await this.cloudinary.uploadFile(file, {
      folder: "tf/notifications",
      allowedMimeTypes: IMAGE_TYPES,
      maxSizeBytes: IMAGE_MAX_SIZE,
      fallbackPrefix: "notification"
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: "admin",
        action: "ADMIN_NOTIFICATION_IMAGE_UPLOADED",
        entityType: "Notification",
        metadata: { uploadId: uploaded.uploadId, imageUrl: uploaded.secureUrl }
      }
    });
    return { imageUrl: uploaded.secureUrl, ...uploaded };
  }
}
