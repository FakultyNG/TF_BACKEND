import { UploadsService } from "../src/uploads/uploads.service";
import { CloudinaryService } from "../src/uploads/cloudinary.service";

describe("UploadsService", () => {
  const file = {
    originalname: "selfie.jpg",
    mimetype: "image/jpeg",
    size: 1024,
    buffer: Buffer.from("image")
  };

  it("uploads profile image and saves secure URL to user profile", async () => {
    const cloudinary = {
      uploadFile: jest.fn().mockResolvedValue({
        uploadId: "tf/users/profile-images/profile_1",
        secureUrl: "https://res.cloudinary.com/tf/profile.jpg",
        attachmentUrl: "https://res.cloudinary.com/tf/profile.jpg",
        fileName: "selfie.jpg",
        fileType: "image/jpeg",
        fileSize: 1024,
        storageProvider: "cloudinary"
      })
    };
    const prisma = {
      profile: { upsert: jest.fn() }
    };
    const service = new UploadsService(cloudinary as never, prisma as never, {} as never);

    await expect(service.uploadProfileImage("user_1", file)).resolves.toMatchObject({
      profileImageUrl: "https://res.cloudinary.com/tf/profile.jpg"
    });
    expect(prisma.profile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user_1" },
      update: { profileImageUrl: "https://res.cloudinary.com/tf/profile.jpg" }
    }));
  });

  it("uploads KYC selfie and stores temporary upload session", async () => {
    const cloudinary = {
      uploadFile: jest.fn().mockResolvedValue({
        uploadId: "tf/users/kyc-selfies/selfie_1",
        secureUrl: "https://res.cloudinary.com/tf/selfie.jpg",
        attachmentUrl: "https://res.cloudinary.com/tf/selfie.jpg",
        fileName: "selfie.jpg",
        fileType: "image/jpeg",
        fileSize: 1024,
        storageProvider: "cloudinary"
      })
    };
    const redis = { setJson: jest.fn() };
    const service = new UploadsService(cloudinary as never, {} as never, redis as never);

    await expect(service.uploadKycSelfie("user_1", file)).resolves.toMatchObject({
      uploadId: "tf/users/kyc-selfies/selfie_1",
      selfieImageUrl: "https://res.cloudinary.com/tf/selfie.jpg"
    });
    expect(redis.setJson).toHaveBeenCalledWith(
      "kyc-selfie-upload:tf/users/kyc-selfies/selfie_1",
      { userId: "user_1", selfieImageUrl: "https://res.cloudinary.com/tf/selfie.jpg" },
      900
    );
  });

  it("rejects non-image files for upload module image endpoints", async () => {
    const cloudinary = new CloudinaryService({ get: jest.fn().mockReturnValue("") } as never);
    await expect(
      cloudinary.uploadFile(
        { originalname: "invoice.pdf", mimetype: "application/pdf", size: 1000, buffer: Buffer.from("pdf") },
        { folder: "tf/users/profile-images", allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"], maxSizeBytes: 2 * 1024 * 1024 }
      )
    ).rejects.toMatchObject({ code: "UNSUPPORTED_UPLOAD_FILE_TYPE" });
  });
});
