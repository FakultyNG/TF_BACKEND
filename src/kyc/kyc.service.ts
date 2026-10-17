import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KycStatus, Prisma } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { ApiException } from "../common/errors/api.exception";
import { sha256 } from "../common/utils/hash.util";
import { PrismaService } from "../prisma/prisma.service";
import { KYC_PROVIDER, SELFIE_KYC_PROVIDER } from "../providers/provider.tokens";
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
    @Inject(KYC_PROVIDER) private readonly kycProvider: KycProvider,
    @Inject(SELFIE_KYC_PROVIDER) private readonly selfieKycProvider: KycProvider
  ) {}

  async verifyBvn(userId: string, bvn: string) {
    const bvnHash = sha256(bvn);
    const existing = await this.prisma.kycRecord.findFirst({
      where: { bvnHash, bvnVerified: true },
      select: { id: true }
    });
    if (existing) {
      throw new ApiException(
        "This BVN is already registered to a Transfa account.",
        "BVN_ALREADY_REGISTERED",
        HttpStatus.CONFLICT
      );
    }
    const kycReference = `kyc_ref_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const result = await this.kycProvider.verifyBvn(bvn, userId, { reference: kycReference });
    const providerLogId = await this.logKycProvider(
      result.provider,
      "kyc_bvn_verify",
      kycReference,
      result.providerReference,
      result.bvnVerified ? "success" : "failed",
      result.rawProviderResponse
    );
    await this.prisma.$transaction([
      this.prisma.kycRecord.create({
        data: {
          userId,
          kycReference,
          provider: result.provider,
          providerReference: result.providerReference,
          bvnHash: result.bvnVerified ? bvnHash : undefined,
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
    const result = await this.selfieKycProvider.verifyBvnWithSelfie(tempSession.bvn, cleaned, userId, {
      firstName: record.firstName ?? undefined,
      middleName: record.middleName ?? undefined,
      lastName: record.lastName ?? undefined,
      dateOfBirth: formatDateForProvider(record.dateOfBirth),
      reference: selfieProviderReference(kycReference)
    });
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
    if (result.faceMatch) await this.redis.del(`kyc-temp:${kycReference}`);
    return {
      kycStatus: result.faceMatch ? "verified" : "rejected",
      faceMatch: result.faceMatch,
      confidenceScore: result.confidenceScore,
      faceMatchStatus: result.faceMatchStatus,
      faceMatchReason: result.faceMatchReason,
      livenessStatus: result.livenessStatus,
      profileImageUrl
    };
  }

  async verifyNin(userId: string, nin: string) {
    if (!this.selfieKycProvider.verifyNin) {
      throw new ApiException("BytID NIN verification is unavailable", "NIN_VERIFICATION_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
    }
    const ninHash = sha256(nin);
    const [user, duplicate, record] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
      this.prisma.kycRecord.findFirst({ where: { ninHash, userId: { not: userId } }, select: { id: true } }),
      this.prisma.kycRecord.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } })
    ]);
    if (!user) throw new ApiException("User not found", "USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (!record || record.status !== KycStatus.verified || !record.bvnVerified) {
      throw new ApiException("Verified BVN is required before adding NIN", "BVN_VERIFICATION_REQUIRED", HttpStatus.FORBIDDEN);
    }
    if (duplicate) {
      throw new ApiException("This NIN is already registered to a Transfa account", "NIN_ALREADY_REGISTERED", HttpStatus.CONFLICT);
    }
    const reference = `nin_ref_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const result = await this.selfieKycProvider.verifyNin(nin, userId, {
      firstName: user.profile?.firstName ?? undefined,
      lastName: user.profile?.lastName ?? undefined,
      dateOfBirth: formatDateForProvider(user.profile?.dateOfBirth),
      reference
    });
    if (!result.ninVerified) {
      throw new ApiException("NIN could not be verified", "NIN_NOT_VERIFIED", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const providerLogId = await this.logKycProvider(
      result.provider,
      "kyc_nin_verify",
      reference,
      result.providerReference,
      "success",
      result.rawProviderResponse
    );
    await this.prisma.$transaction([
      this.prisma.kycRecord.update({
        where: { id: record.id },
        data: {
          ninHash,
          ninMasked: result.ninMasked,
          rawProviderLogId: providerLogId,
          metadata: { ...((record.metadata as object) ?? {}), nin: result } as unknown as Prisma.InputJsonObject
        }
      }),
      this.prisma.profile.updateMany({
        where: { userId, email: null },
        data: { email: result.email }
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { accountTier: user.accountTier === "prime" ? "prime" : "captain" }
      }),
      this.prisma.auditLog.create({
        data: { actorId: userId, actorType: "user", action: "NIN_VERIFIED_TIER_UPGRADED", entityType: "KycRecord", entityId: record.id, metadata: { accountTier: user.accountTier === "prime" ? "prime" : "captain" } }
      })
    ]);
    return {
      ninVerified: true,
      ninMasked: result.ninMasked,
      accountTier: user.accountTier === "prime" ? "prime" : "captain",
      email: user.profile?.email ?? result.email ?? null,
      profileImageUrl: user.profile?.profileImageUrl ?? null
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
      const cashDrop = this.cashDropService.isEnabled() ? await this.cashDropService.register(userId, selfieImageBase64) : undefined;
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorType: "system",
          action: "KYC_AUTO_PROVISION_COMPLETED",
          entityType: "User",
          entityId: userId,
          metadata: { dvaReady: true, cashDropEnabled: this.cashDropService.isEnabled(), cashDropId: cashDrop?.CashDropId }
        }
      });
      return {
        walletActivated: true,
        dvaReady: true,
        cashDropRegistered: Boolean(cashDrop),
        cashDropId: cashDrop?.CashDropId,
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

function selfieProviderReference(kycReference: string) {
  return `${kycReference}:selfie:${uuid().replace(/-/g, "").slice(0, 10)}`;
}

function formatDateForProvider(value?: Date | null) {
  if (!value) return undefined;
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
