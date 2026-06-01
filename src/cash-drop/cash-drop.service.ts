import { HttpStatus, Injectable } from "@nestjs/common";
import { CashDropProfileStatus, DvaStatus, KycStatus, WalletStatus } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { ApiException } from "../common/errors/api.exception";
import { offset, pagination } from "../common/dto/pagination-query.dto";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CashDropFingerprintService } from "./cash-drop-fingerprint.service";

@Injectable()
export class CashDropService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fingerprintService: CashDropFingerprintService,
    private readonly redis: RedisService,
    private readonly config: ConfigService
  ) {}

  async register(userId: string, sourceImageBase64?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        kycRecords: { orderBy: { createdAt: "desc" }, take: 1 },
        dedicatedVirtualAccounts: { where: { status: DvaStatus.active }, take: 1 }
      }
    });
    const dva = user?.dedicatedVirtualAccounts[0];
    if (
      !user ||
      user.kycRecords[0]?.status !== KycStatus.verified ||
      user.walletStatus !== WalletStatus.active ||
      !user.profile?.profileImageUrl ||
      !dva
    ) {
      throw new ApiException("CashDrop registration failed", "CASH_DROP_REGISTRATION_FAILED", HttpStatus.BAD_REQUEST);
    }
    try {
      const fingerprint = sourceImageBase64
        ? await this.fingerprintService.fingerprintFromBase64(sourceImageBase64)
        : await this.fingerprintService.fingerprintFromImageUrl(user.profile.profileImageUrl);
      const cashDrop = await this.prisma.cashDropProfile.upsert({
        where: { userId },
        create: {
          userId,
          dvaId: dva.id,
          profileImageUrl: user.profile.profileImageUrl,
          fingerprint: fingerprint.fingerprint,
          fingerprintHash: fingerprint.fingerprintHash,
          status: CashDropProfileStatus.active
        },
        update: {
          dvaId: dva.id,
          profileImageUrl: user.profile.profileImageUrl,
          fingerprint: fingerprint.fingerprint,
          fingerprintHash: fingerprint.fingerprintHash,
          status: CashDropProfileStatus.active,
          disabledAt: null,
          registeredAt: new Date()
        }
      });
      return {
        CashDropId: cashDrop.id,
        userId: cashDrop.userId,
        status: cashDrop.status,
        linkedToDva: true
      };
    } catch {
      throw new ApiException("CashDrop registration failed", "CASH_DROP_REGISTRATION_FAILED", HttpStatus.BAD_REQUEST);
    }
  }

  async status(userId: string) {
    const profile = await this.prisma.cashDropProfile.findUnique({ where: { userId } });
    return {
      enabled: profile?.status === CashDropProfileStatus.active,
      CashDropId: profile?.id ?? null,
      profileImageUrl: profile?.profileImageUrl ?? null,
      status: profile?.status ?? "not_registered"
    };
  }

  async disable(userId: string, reason?: string) {
    await this.prisma.cashDropProfile.updateMany({
      where: { userId },
      data: { status: CashDropProfileStatus.disabled, disabledAt: new Date() }
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        actorType: "user",
        action: "CASH_DROP_DISABLED",
        entityType: "CashDropProfile",
        metadata: { reason }
      }
    });
    return { enabled: false, status: CashDropProfileStatus.disabled };
  }

  async resolve(userId: string, scannedImageBase64: string) {
    await this.enforceResolveRateLimit(userId);
    let scanned;
    try {
      scanned = await this.fingerprintService.fingerprintFromBase64(scannedImageBase64);
    } catch {
      await this.auditResolve(userId, false, 0);
      throw new ApiException("Could not safely identify this profile image", "CASH_DROP_NO_SAFE_MATCH", HttpStatus.NOT_FOUND);
    }
    const candidates = await this.prisma.cashDropProfile.findMany({
      where: { status: CashDropProfileStatus.active },
      include: {
        user: { include: { profile: true } },
        dva: true
      }
    });
    let best: { candidate: (typeof candidates)[number]; confidence: number } | null = null;
    let secondBest: { candidate: (typeof candidates)[number]; confidence: number } | null = null;
    for (const candidate of candidates) {
      if (candidate.status !== CashDropProfileStatus.active) continue;
      const confidence = this.fingerprintService.compare(scanned.fingerprint, candidate.fingerprint);
      if (!best || confidence > best.confidence) {
        secondBest = best;
        best = { candidate, confidence };
      } else if (!secondBest || confidence > secondBest.confidence) {
        secondBest = { candidate, confidence };
      }
    }
    const threshold = Number(this.config.get<string>("CASH_DROP_MATCH_THRESHOLD", "92"));
    const ambiguityMargin = Number(this.config.get<string>("CASH_DROP_AMBIGUITY_MARGIN", "1"));
    const ambiguous = Boolean(secondBest && secondBest.confidence >= threshold && best && best.confidence - secondBest.confidence <= ambiguityMargin);
    if (!best || best.confidence < threshold || ambiguous) {
      await this.auditResolve(userId, false, best?.confidence ?? 0);
      throw new ApiException("Could not safely identify this profile image", "CASH_DROP_NO_SAFE_MATCH", HttpStatus.NOT_FOUND);
    }
    await this.auditResolve(userId, true, best.confidence, best.candidate.userId);
    return {
      receiverId: best.candidate.userId,
      displayName: this.displayName(best.candidate.user.profile),
      profileImageUrl: best.candidate.profileImageUrl,
      bankName: best.candidate.dva.bankName,
      accountNumber: best.candidate.dva.accountNumber,
      accountName: best.candidate.dva.accountName,
      currency: "NGN",
      matchConfidence: best.confidence
    };
  }

  async listAdmin(query: { page?: number; limit?: number; status?: CashDropProfileStatus; userId?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { status: query.status, userId: query.userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.cashDropProfile.findMany({
        where,
        take: limit,
        skip: offset(page, limit),
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          userId: true,
          dvaId: true,
          profileImageUrl: true,
          algorithm: true,
          status: true,
          registeredAt: true,
          disabledAt: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { phoneNumber: true, profile: true, walletStatus: true } },
          dva: { select: { bankName: true, accountNumber: true, accountName: true, status: true } }
        }
      }),
      this.prisma.cashDropProfile.count({ where })
    ]);
    return { items, pagination: pagination(page, limit, total) };
  }

  async getAdmin(id: string) {
    const profile = await this.prisma.cashDropProfile.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        dvaId: true,
        profileImageUrl: true,
        algorithm: true,
        status: true,
        registeredAt: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { phoneNumber: true, profile: true, walletStatus: true, kycRecords: { orderBy: { createdAt: "desc" }, take: 1 } } },
        dva: { select: { bankName: true, accountNumber: true, accountName: true, status: true } }
      }
    });
    if (!profile) throw new ApiException("CashDrop profile not found", "CASH_DROP_PROFILE_NOT_FOUND", HttpStatus.NOT_FOUND);
    return profile;
  }

  async adminDisable(adminId: string, id: string, reason?: string) {
    const updated = await this.prisma.cashDropProfile.update({
      where: { id },
      data: { status: CashDropProfileStatus.disabled, disabledAt: new Date() }
    });
    await this.prisma.auditLog.create({
      data: { actorId: adminId, actorType: "admin", action: "ADMIN_CASH_DROP_DISABLED", entityType: "CashDropProfile", entityId: id, metadata: { reason } }
    });
    return { CashDropId: updated.id, enabled: false, status: updated.status };
  }

  async adminEnable(adminId: string, id: string) {
    const updated = await this.prisma.cashDropProfile.update({
      where: { id },
      data: { status: CashDropProfileStatus.active, disabledAt: null }
    });
    await this.prisma.auditLog.create({
      data: { actorId: adminId, actorType: "admin", action: "ADMIN_CASH_DROP_ENABLED", entityType: "CashDropProfile", entityId: id, metadata: {} }
    });
    return { CashDropId: updated.id, enabled: true, status: updated.status };
  }

  private async enforceResolveRateLimit(userId: string) {
    const ttl = Number(this.config.get<string>("CASH_DROP_RESOLVE_TTL_SECONDS", "60"));
    const max = Number(this.config.get<string>("CASH_DROP_RESOLVE_MAX_ATTEMPTS", "10"));
    const attempts = await this.redis.incrementWithTtl(`cash-drop-resolve:${userId}`, ttl);
    if (attempts > max) {
      throw new ApiException("Too many CashDrop resolve attempts", "CASH_DROP_RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async auditResolve(actorId: string, matched: boolean, confidence: number, receiverId?: string) {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: "user",
        action: "CASH_DROP_RESOLVE_ATTEMPT",
        entityType: "CashDropProfile",
        entityId: receiverId,
        metadata: { matched, confidence, receiverId }
      }
    });
  }

  private displayName(profile: { firstName: string | null; lastName: string | null } | null) {
    const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();
    return name || "Transfa User";
  }
}
