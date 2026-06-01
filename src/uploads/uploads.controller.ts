import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { memoryStorage } from "multer";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UploadsService } from "./uploads.service";

const uploadInterceptor = FileInterceptor("file", {
  storage: memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

const fileBody = {
  schema: {
    type: "object",
    properties: {
      file: { type: "string", format: "binary" }
    },
    required: ["file"]
  }
};

@ApiTags("Uploads")
@ApiBearerAuth()
@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post("profile-image")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes("multipart/form-data")
  @ApiBody(fileBody)
  async profileImage(@CurrentUser() user: { sub: string }, @UploadedFile() file: Express.Multer.File) {
    const data = await this.uploads.uploadProfileImage(user.sub, file);
    return success("Profile image uploaded successfully", data);
  }

  @Post("kyc-selfie")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes("multipart/form-data")
  @ApiBody(fileBody)
  async kycSelfie(@CurrentUser() user: { sub: string }, @UploadedFile() file: Express.Multer.File) {
    const data = await this.uploads.uploadKycSelfie(user.sub, file);
    return success("KYC selfie uploaded successfully", data);
  }

  @Post("support-attachment")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes("multipart/form-data")
  @ApiBody(fileBody)
  async supportAttachment(@CurrentUser() user: { sub: string }, @UploadedFile() file: Express.Multer.File) {
    const data = await this.uploads.uploadSupportAttachment(user.sub, file);
    return success("Support attachment uploaded successfully", data);
  }

  @Post("notification-image")
  @UseGuards(AdminJwtAuthGuard)
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes("multipart/form-data")
  @ApiBody(fileBody)
  async notificationImage(@CurrentUser() admin: { sub: string }, @UploadedFile() file: Express.Multer.File) {
    const data = await this.uploads.uploadNotificationImage(admin.sub, file);
    return success("Notification image uploaded successfully", data);
  }
}
