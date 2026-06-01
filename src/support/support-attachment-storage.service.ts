import { Injectable } from "@nestjs/common";
import { CloudinaryService } from "../uploads/cloudinary.service";

export interface SupportUploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class SupportAttachmentStorageService {
  private readonly allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  private readonly maxSize = 5 * 1024 * 1024;

  constructor(private readonly cloudinary: CloudinaryService) {}

  upload(file: SupportUploadFile) {
    return this.cloudinary.uploadFile(file, {
      folder: "tf/support/attachments",
      allowedMimeTypes: this.allowedTypes,
      maxSizeBytes: this.maxSize,
      fallbackPrefix: "support"
    });
  }

  validate(file?: SupportUploadFile) {
    this.cloudinary.validateFile(file, this.allowedTypes, this.maxSize);
  }
}
