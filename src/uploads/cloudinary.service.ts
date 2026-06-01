import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { randomUUID } from "crypto";
import { ApiException } from "../common/errors/api.exception";

export interface UploadFileInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadValidationOptions {
  folder: string;
  allowedMimeTypes: string[];
  maxSizeBytes: number;
  fallbackPrefix?: string;
}

@Injectable()
export class CloudinaryService {
  constructor(private readonly config: ConfigService) {}

  async uploadFile(file: UploadFileInput, options: UploadValidationOptions) {
    this.validateFile(file, options.allowedMimeTypes, options.maxSizeBytes);
    if (!this.isConfigured()) return this.mockUpload(file.originalname, file.mimetype, file.size, options.folder, options.fallbackPrefix);
    const result = await this.uploadBuffer(file.buffer, file.originalname, file.mimetype, options.folder);
    return this.toResponse(result, file.originalname, file.mimetype, file.size);
  }

  async uploadBase64Image(base64Image: string, folder: string, fileName = "kyc-selfie.jpg") {
    const cleaned = base64Image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
    const buffer = Buffer.from(cleaned, "base64");
    const mimeType = this.mimeTypeFromBase64(base64Image);
    this.validateFile({ originalname: fileName, mimetype: mimeType, size: buffer.length, buffer }, ["image/jpeg", "image/png", "image/webp"], 2 * 1024 * 1024);
    if (!this.isConfigured()) return this.mockUpload(fileName, mimeType, buffer.length, folder, "kyc_selfie");
    const dataUri = `data:${mimeType};base64,${cleaned}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: "image",
      use_filename: false,
      unique_filename: true,
      overwrite: false
    });
    return this.toResponse(result, fileName, mimeType, buffer.length);
  }

  validateFile(file: UploadFileInput | undefined, allowedMimeTypes: string[], maxSizeBytes: number) {
    if (!file) throw new ApiException("Upload file is required", "UPLOAD_FILE_REQUIRED", HttpStatus.BAD_REQUEST);
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new ApiException("Unsupported upload file type", "UNSUPPORTED_UPLOAD_FILE_TYPE", HttpStatus.BAD_REQUEST);
    }
    if (file.size > maxSizeBytes) {
      throw new ApiException("Upload file is too large", "UPLOAD_FILE_TOO_LARGE", HttpStatus.BAD_REQUEST);
    }
  }

  private uploadBuffer(buffer: Buffer, fileName: string, mimeType: string, folder: string) {
    return new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: mimeType === "application/pdf" ? "raw" : "image",
          use_filename: true,
          unique_filename: true,
          overwrite: false,
          filename_override: fileName
        },
        (error, result) => {
          if (error || !result) reject(error ?? new Error("Cloudinary upload failed"));
          else resolve(result);
        }
      );
      stream.end(buffer);
    }).catch(() => {
      throw new ApiException("Cloudinary upload failed", "CLOUDINARY_UPLOAD_FAILED", HttpStatus.BAD_GATEWAY);
    });
  }

  private isConfigured() {
    const cloudName = this.config.get<string>("CLOUDINARY_CLOUD_NAME");
    const apiKey = this.config.get<string>("CLOUDINARY_API_KEY");
    const apiSecret = this.config.get<string>("CLOUDINARY_API_SECRET");
    if (!cloudName || !apiKey || !apiSecret) return false;
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    return true;
  }

  private toResponse(result: UploadApiResponse, fileName: string, fileType: string, fileSize: number) {
    return {
      uploadId: result.public_id,
      attachmentUrl: result.secure_url,
      secureUrl: result.secure_url,
      fileName,
      fileType,
      fileSize,
      storageProvider: "cloudinary"
    };
  }

  private mockUpload(fileName: string, fileType: string, fileSize: number, folder: string, fallbackPrefix = "upload") {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uploadId = `${folder}/${fallbackPrefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}_${safeName}`;
    const secureUrl = `https://res.cloudinary.com/mock-transfa/image/upload/${uploadId}`;
    return {
      uploadId,
      attachmentUrl: secureUrl,
      secureUrl,
      fileName,
      fileType,
      fileSize,
      storageProvider: "cloudinary"
    };
  }

  private mimeTypeFromBase64(value: string) {
    const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    return match?.[1] ?? "image/jpeg";
  }
}
