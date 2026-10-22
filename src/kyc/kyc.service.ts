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
import { AdminUpdateKycDto } from "../admin/dto/admin-update-kyc.dto";
import { OtpService } from "../otp/otp.service";
import { NinVerificationResult } from "../providers/interfaces/kyc-provider.interface";

type PendingNinVerification = {
  userId: string;
  recordId: string;
  ninHash: string;
  result: NinVerificationResult;
  phoneNumber: string;
};

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly walletService: WalletService,
    private readonly cashDropService: CashDropService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly otpService: OtpService,
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
      await this.throwNinFailure(userId, "NIN could not be verified", "NIN_NOT_VERIFIED");
    }
    const phoneMatches = samePhone(user.phoneNumber, record.phoneNumber, result.phoneNumber);
    if (phoneMatches) {
      const challenge = await this.otpService.sendOtp(user.phoneNumber, "nin_verification");
      const pending: PendingNinVerification = {
        userId,
        recordId: record.id,
        ninHash,
        result,
        phoneNumber: user.phoneNumber
      };
      await this.redis.setJson(
        `nin-pending:${userId}:${challenge.otpReference}`,
        pending,
        Number(this.config.get<string>("OTP_TTL_SECONDS", "300"))
      );
      return {
        ninVerified: false,
        otpRequired: true,
        otpReference: challenge.otpReference,
        maskedPhone: maskPhone(user.phoneNumber)
      };
    }

    const accountName = [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(" ");
    const ninName = [result.firstName, result.middleName, result.lastName].filter(Boolean).join(" ");
    const namesMatch = atLeastTwoNamesMatch(accountName, ninName);
    const configuredThreshold = Number(this.config.get<string>("NIN_FACE_MATCH_THRESHOLD", "50"));
    const faceThreshold = Number.isFinite(configuredThreshold)
      ? Math.min(100, Math.max(50, configuredThreshold))
      : 50;
    const face = user.profile?.profileImageUrl && result.imageUrl
      ? await this.cashDropService.matchProfileImages(user.profile.profileImageUrl, result.imageUrl, faceThreshold)
      : { matched: false, confidence: 0, threshold: faceThreshold };
    if (!namesMatch || !face.matched) {
      await this.throwNinFailure(
        userId,
        !namesMatch ? "The NIN name does not match this Transfa account" : "The NIN photograph does not match the account face shot",
        !namesMatch ? "NIN_NAME_MISMATCH" : "NIN_FACE_MISMATCH",
        { namesMatch, faceMatch: face.matched, confidence: face.confidence, threshold: face.threshold }
      );
    }
    return this.completeNinVerification(userId, record.id, ninHash, result, user.accountTier, user.profile?.email);
  }

  async confirmNinOtp(userId: string, otpReference: string, otp: string) {
    const key = `nin-pending:${userId}:${otpReference}`;
    const pending = await this.redis.getJson<PendingNinVerification>(key);
    if (!pending || pending.userId !== userId) {
      throw new ApiException("NIN verification session expired", "NIN_OTP_SESSION_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    try {
      await this.otpService.validateOtp(pending.phoneNumber, otp, otpReference);
      await this.otpService.consumeValidatedOtp(otpReference, pending.phoneNumber, "nin_verification");
    } catch (error) {
      if (error instanceof ApiException && ["OTP_INVALID", "OTP_TOO_MANY_ATTEMPTS"].includes(error.code)) {
        await this.throwNinFailure(userId, error.message, error.code);
      }
      throw error;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) throw new ApiException("User not found", "USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    await this.redis.del(key);
    return this.completeNinVerification(
      userId,
      pending.recordId,
      pending.ninHash,
      pending.result,
      user.accountTier,
      user.profile?.email
    );
  }

  async resendNinOtp(userId: string, otpReference: string) {
    const oldKey = `nin-pending:${userId}:${otpReference}`;
    const pending = await this.redis.getJson<PendingNinVerification>(oldKey);
    if (!pending || pending.userId !== userId) {
      throw new ApiException("NIN verification session expired", "NIN_OTP_SESSION_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    const challenge = await this.otpService.resendOtp(pending.phoneNumber, otpReference);
    await Promise.all([
      this.redis.del(oldKey),
      this.redis.setJson(
        `nin-pending:${userId}:${challenge.otpReference}`,
        pending,
        Number(this.config.get<string>("OTP_TTL_SECONDS", "300"))
      )
    ]);
    return { ...challenge, maskedPhone: maskPhone(pending.phoneNumber) };
  }

  private async completeNinVerification(
    userId: string,
    recordId: string,
    ninHash: string,
    result: NinVerificationResult,
    currentTier: string,
    existingEmail?: string | null
  ) {
    const [record, profile] = await Promise.all([
      this.prisma.kycRecord.findUnique({ where: { id: recordId }, select: { metadata: true } }),
      this.prisma.profile.findUnique({ where: { userId }, select: { profileImageUrl: true } })
    ]);
    if (!record) throw new ApiException("KYC record not found", "KYC_RECORD_NOT_FOUND", HttpStatus.NOT_FOUND);
    const providerLogId = await this.logKycProvider(
      result.provider,
      "kyc_nin_verify",
      result.providerReference ?? recordId,
      result.providerReference,
      "success",
      result.rawProviderResponse
    );
    await this.prisma.$transaction([
      this.prisma.kycRecord.update({
        where: { id: recordId },
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
        data: { accountTier: currentTier === "prime" ? "prime" : "captain" }
      }),
      this.prisma.auditLog.create({
        data: { actorId: userId, actorType: "user", action: "NIN_VERIFIED_TIER_UPGRADED", entityType: "KycRecord", entityId: recordId, metadata: { accountTier: currentTier === "prime" ? "prime" : "captain" } }
      })
    ]);
    await this.walletService.processMoneyLimitHolds(userId).catch(() => undefined);
    await this.redis.del(`nin-failures:${userId}`);
    return {
      ninVerified: true,
      ninMasked: result.ninMasked,
      otpRequired: false,
      accountTier: currentTier === "prime" ? "prime" : "captain",
      email: existingEmail ?? result.email ?? null,
      profileImageUrl: profile?.profileImageUrl ?? null
    };
  }

  private async throwNinFailure(userId: string, message: string, code: string, details: Record<string, unknown> = {}): Promise<never> {
    const attempts = await this.redis.incrementWithTtl(`nin-failures:${userId}`, 60 * 60 * 24);
    throw new ApiException(message, code, HttpStatus.UNPROCESSABLE_ENTITY, {
      ...details,
      attempts,
      supportRequired: attempts >= 3,
      supportMessage: attempts >= 3 ? "I need help upgrading my limit to captain tier" : undefined
    });
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

  async adminUpdateRecord(adminId: string, id: string, dto: AdminUpdateKycDto) {
    const existing = await this.prisma.kycRecord.findUnique({
      where: { id },
      include: { user: { select: { status: true } } }
    });
    if (!existing) {
      throw new ApiException("KYC record not found", "KYC_RECORD_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined;
    const profileFields = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      dateOfBirth,
      gender: dto.gender,
      country: dto.country
    };
    const changedFields = Object.entries(dto).filter(([, value]) => value !== undefined).map(([key]) => key);
    const syncProfile = dto.syncProfile !== false && Object.values(profileFields).some((value) => value !== undefined);

    await this.prisma.$transaction(async (tx) => {
      await tx.kycRecord.update({
        where: { id },
        data: {
          status: dto.status,
          bvnVerified: dto.bvnVerified,
          selfieVerified: dto.selfieVerified,
          faceMatch: dto.faceMatch,
          confidenceScore: dto.confidenceScore,
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          email: dto.email,
          phoneNumber: dto.phoneNumber,
          dateOfBirth,
          gender: dto.gender,
          country: dto.country,
          verifiedAt: dto.status === undefined ? undefined : dto.status === KycStatus.verified ? new Date() : null
        }
      });
      if (syncProfile) {
        await tx.profile.upsert({
          where: { userId: existing.userId },
          create: { userId: existing.userId, ...profileFields },
          update: profileFields
        });
      }
      if (dto.status !== undefined) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            walletStatus:
              dto.status === KycStatus.verified && existing.user.status === "active" ? "active" : "inactive"
          }
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorType: "admin",
          action: "ADMIN_KYC_RECORD_UPDATED",
          entityType: "KycRecord",
          entityId: id,
          metadata: { changedFields, syncProfile }
        }
      });
    });

    return this.prisma.kycRecord.findUnique({
      where: { id },
      include: { user: { select: { id: true, phoneNumber: true, status: true, walletStatus: true, accountTier: true } } }
    });
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

function atLeastTwoNamesMatch(first: string, second: string) {
  const left = nameTokens(first);
  const right = new Set(nameTokens(second));
  return left.filter((token) => right.has(token)).length >= 2;
}

function nameTokens(value: string) {
  return [...new Set(
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1)
  )];
}

function samePhone(...values: Array<string | null | undefined>) {
  const normalized = values.map(canonicalPhone);
  return normalized.every(Boolean) && new Set(normalized).size === 1;
}

function canonicalPhone(value?: string | null) {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) digits = `234${digits.slice(1)}`;
  return digits;
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length <= 4 ? "****" : `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
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
