import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KycStatus, Prisma } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { ApiException } from "../common/errors/api.exception";
import { sha256 } from "../common/utils/hash.util";
import { PrismaService } from "../prisma/prisma.service";
import { KYC_PROVIDER } from "../providers/provider.tokens";
import { KycProvider } from "../providers/interfaces/kyc-provider.interface";
import { RedisService } from "../redis/redis.service";
import { WalletService } from "../wallet/wallet.service";
import { CashDropService } from "../cash-drop/cash-drop.service";
import { CloudinaryService } from "../uploads/cloudinary.service";

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly walletService: WalletService,
    private readonly cashDropService: CashDropService,
    private readonly cloudinaryService: CloudinaryService,
    @Inject(KYC_PROVIDER) private readonly kycProvider: KycProvider
  ) {}

  async verifyBvn(userId: string, bvn: string) {
    const result = await this.kycProvider.verifyBvn(bvn, userId);
    const kycReference = `kyc_ref_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const providerLogId = await this.logKycProvider(result.provider, "kyc_bvn_verify", kycReference, result.providerReference, result.bvnVerified ? "success" : "failed", result.rawProviderResponse);
    await this.prisma.$transaction([
      this.prisma.kycRecord.create({
        data: {
          userId,
          kycReference,
          provider: result.provider,
          providerReference: result.providerReference,
          bvnHash: sha256(bvn),
          bvnMasked: result.bvnMasked,
          bvnVerified: result.bvnVerified,
          status: result.bvnVerified ? KycStatus.bvn_verified : KycStatus.rejected,
          firstName: result.firstName,
          middleName: result.middleName,
          lastName: result.lastName,
          email: result.email,
          phoneNumber: result.phoneNumber,
          dateOfBirth: parseProviderDate(result.dateOfBirth),
          gender: result.gender,
          country: result.country,
          ninMasked: result.ninMasked,
          ninHash: result.ninHash,
          imageUrl: result.imageUrl,
          rawProviderLogId: providerLogId,
          metadata: result as unknown as Prisma.InputJsonObject
        }
      }),
      this.prisma.profile.upsert({
        where: { userId },
        create: {
          userId,
          firstName: result.firstName,
          lastName: result.lastName,
          email: result.email,
          dateOfBirth: parseProviderDate(result.dateOfBirth),
          gender: result.gender,
          country: result.country
        },
        update: {
          firstName: result.firstName,
          lastName: result.lastName,
          email: result.email,
          dateOfBirth: parseProviderDate(result.dateOfBirth),
          gender: result.gender,
          country: result.country
        }
      }),
      this.prisma.auditLog.create({
        data: { actorId: userId, actorType: "user", action: "BVN_VERIFIED", entityType: "KycRecord", entityId: kycReference }
      })
    ]);
    await this.redis.setJson(
      `kyc-temp:${kycReference}`,
      { userId, kycReference, bvn, bvnVerified: result.bvnVerified },
      Number(this.config.get<string>("REGISTRATION_TTL_SECONDS", "900"))
    );
    return { kycReference, ...result };
  }

  async validateSelfie(userId: string, kycReference: string, selfieImageBase64: string) {
    const tempSession = await this.redis.getJson<{ userId: string; bvn?: string; bvnVerified: boolean }>(`kyc-temp:${kycReference}`);
    const record = await this.prisma.kycRecord.findUnique({ where: { kycReference } });
    if (!record || record.userId !== userId || (tempSession && tempSession.userId !== userId)) {
      throw new ApiException("KYC record not found", "KYC_RECORD_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    if (!tempSession?.bvn || !tempSession.bvnVerified) {
      throw new ApiException("KYC BVN verification session expired", "KYC_BVN_SESSION_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    const cleaned = selfieImageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
    const uploadedSelfie = await this.cloudinaryService.uploadBase64Image(
      selfieImageBase64,
      "tf/users/kyc-selfies",
      `${kycReference}.jpg`
    );
    const result = await this.kycProvider.verifyBvnWithSelfie(tempSession.bvn, cleaned, userId);
    const providerLogId = await this.logKycProvider(result.provider, "kyc_bvn_face_validate", kycReference, result.providerReference, result.faceMatch ? "success" : "failed", result.rawProviderResponse);
    const profileImageUrl = result.faceMatch ? uploadedSelfie.secureUrl : result.profileImageUrl;
    await this.prisma.$transaction([
      this.prisma.kycRecord.update({
        where: { kycReference },
        data: {
          provider: result.provider,
          providerReference: result.providerReference ?? record.providerReference,
          bvnMasked: result.bvnMasked ?? record.bvnMasked,
          bvnVerified: result.bvnVerified,
          selfieVerified: result.selfieVerified,
          faceMatch: result.faceMatch,
          confidenceScore: result.confidenceScore,
          status: result.faceMatch ? KycStatus.verified : KycStatus.rejected,
          firstName: result.firstName ?? record.firstName,
          middleName: result.middleName ?? record.middleName,
          lastName: result.lastName ?? record.lastName,
          email: result.email ?? record.email,
          phoneNumber: result.phoneNumber ?? record.phoneNumber,
          dateOfBirth: parseProviderDate(result.dateOfBirth) ?? record.dateOfBirth,
          gender: result.gender ?? record.gender,
          country: result.country ?? record.country,
          ninMasked: result.ninMasked ?? record.ninMasked,
          ninHash: result.ninHash ?? record.ninHash,
          imageUrl: result.imageUrl ?? record.imageUrl,
          profileImageUrl,
          rawProviderLogId: providerLogId,
          verifiedAt: result.faceMatch ? new Date() : undefined,
          metadata: {
            ...((record.metadata as object) ?? {}),
            selfie: result,
            selfieImageUrl: uploadedSelfie.secureUrl,
            selfieUploadId: uploadedSelfie.uploadId
          } as unknown as Prisma.InputJsonObject
        }
      }),
      this.prisma.profile.updateMany({
        where: { userId },
        data: {
          firstName: result.firstName ?? undefined,
          lastName: result.lastName ?? undefined,
          email: result.email ?? undefined,
          dateOfBirth: parseProviderDate(result.dateOfBirth),
          gender: result.gender ?? undefined,
          country: result.country ?? undefined,
          profileImageUrl
        }
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { walletStatus: result.faceMatch ? "active" : "inactive" }
      }),
      this.prisma.auditLog.create({
        data: { actorId: userId, actorType: "user", action: "SELFIE_VALIDATED", entityType: "KycRecord", entityId: record.id }
      })
    ]);
    if (result.faceMatch) await this.autoProvisionAfterKycVerified(userId, selfieImageBase64);
    await this.redis.del(`kyc-temp:${kycReference}`);
    return {
      kycStatus: result.faceMatch ? "verified" : "rejected",
      faceMatch: result.faceMatch,
      confidenceScore: result.confidenceScore,
      profileImageUrl
    };
  }

  async getStatus(userId: string) {
    const record = await this.prisma.kycRecord.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });
    return {
      kycStatus: record?.status ?? "not_started",
      provider: record?.provider,
      bvnVerified: record?.bvnVerified ?? false,
      selfieVerified: record?.selfieVerified ?? false,
      walletEligible: record?.status === KycStatus.verified
    };
  }

  listRecords(take = 50, skip = 0, provider?: string) {
    return this.prisma.kycRecord.findMany({
      where: provider ? { provider } : undefined,
      take,
      skip,
      include: { user: { select: { id: true, phoneNumber: true, role: true, status: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async updateStatus(adminId: string, id: string, status: KycStatus) {
    const record = await this.prisma.kycRecord.update({
      where: { id },
      data: { status, verifiedAt: status === KycStatus.verified ? new Date() : undefined }
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: "admin",
        action: "ADMIN_KYC_STATUS_UPDATED",
        entityType: "KycRecord",
        entityId: id,
        metadata: { status }
      }
    });
    return record;
  }

  private async logKycProvider(
    provider: string,
    operation: string,
    requestReference: string,
    providerReference: string | undefined,
    status: string,
    responsePayload: unknown
  ) {
    const log = await this.prisma.providerLog.create({
      data: {
        provider,
        operation,
        requestReference,
        providerReference,
        status,
        responsePayload: (responsePayload ?? {}) as Prisma.InputJsonValue
      }
    });
    return log.id;
  }

  private async autoProvisionAfterKycVerified(userId: string, selfieImageBase64: string) {
    try {
      await this.walletService.activateWallet(userId);
      const dva = await this.walletService.createDva(userId, "auto");
      const cashDrop = await this.cashDropService.register(userId, selfieImageBase64);
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorType: "system",
          action: "KYC_AUTO_PROVISION_COMPLETED",
          entityType: "User",
          entityId: userId,
          metadata: { dvaReady: true, cashDropId: cashDrop.CashDropId }
        }
      });
      return {
        walletActivated: true,
        dvaReady: true,
        cashDropRegistered: true,
        cashDropId: cashDrop.CashDropId,
        dva
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "KYC auto provisioning failed";
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorType: "system",
          action: "KYC_AUTO_PROVISION_FAILED",
          entityType: "User",
          entityId: userId,
          metadata: { message }
        }
      });
      return {
        walletActivated: true,
        dvaReady: false,
        cashDropRegistered: false,
        errorCode: "KYC_AUTO_PROVISION_FAILED"
      };
    }
  }
}

function parseProviderDate(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
