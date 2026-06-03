import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AuthSessionStatus, KycStatus, Prisma, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { CashDropService } from "../cash-drop/cash-drop.service";
import { ApiException } from "../common/errors/api.exception";
import { sha256 } from "../common/utils/hash.util";
import { normalizePhoneNumber } from "../common/utils/phone.util";
import { PrismaService } from "../prisma/prisma.service";
import { KycProvider } from "../providers/interfaces/kyc-provider.interface";
import { KYC_PROVIDER } from "../providers/provider.tokens";
import { RedisService } from "../redis/redis.service";
import { CloudinaryService } from "../uploads/cloudinary.service";
import { UsersRepository } from "../users/users.repository";
import { UsersService } from "../users/users.service";
import { WalletService } from "../wallet/wallet.service";
import { CompleteRegistrationDto } from "./dto/complete-registration.dto";
import { LoginDto } from "./dto/login.dto";
import { RegistrationKycState, RegistrationSession } from "./types/registration-session";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepository: UsersRepository,
    private readonly usersService: UsersService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(KYC_PROVIDER) private readonly kycProvider: KycProvider,
    private readonly cloudinaryService: CloudinaryService,
    private readonly walletService: WalletService,
    private readonly cashDropService: CashDropService
  ) {}

  async startRegistration(phoneNumber: string) {
    const normalized = normalizePhoneNumber(phoneNumber);
    const existing = await this.usersRepository.findByPhoneNumber(normalized);
    if (existing) throw new ApiException("User already exists", "USER_ALREADY_EXISTS", HttpStatus.CONFLICT);
    const existingToken = await this.redis.getJson<string>(`registration-phone:${normalized}`);
    if (existingToken) {
      return { registrationToken: existingToken, phoneNumber: normalized, requiresOtp: true };
    }
    const registrationToken = `reg_temp_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const session: RegistrationSession = {
      phoneNumber: normalized,
      requiresOtp: true,
      createdAt: new Date().toISOString()
    };
    const ttl = Number(this.config.get<string>("REGISTRATION_TTL_SECONDS", "900"));
    await this.redis.setJson(
      `registration:${registrationToken}`,
      session,
      ttl
    );
    await this.redis.setJson(`registration-phone:${normalized}`, registrationToken, ttl);
    return { registrationToken, phoneNumber: normalized, requiresOtp: true };
  }

  async verifyRegistrationBvn(registrationToken: string, bvn: string) {
    const { session, ttl } = await this.getRegistrationSession(registrationToken);
    const result = await this.kycProvider.verifyBvn(bvn, `registration:${registrationToken}`);
    const kycReference = `kyc_ref_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const kyc: RegistrationKycState = {
      kycReference,
      providerReference: result.providerReference,
      bvnHash: sha256(bvn),
      bvnMasked: result.bvnMasked,
      bvn,
      bvnVerified: result.bvnVerified,
      status: result.bvnVerified ? KycStatus.bvn_verified : KycStatus.rejected,
      providerResult: result
    };
    await this.redis.setJson(`registration:${registrationToken}`, { ...session, kyc }, ttl);
    return { kycReference, ...result };
  }

  async validateRegistrationSelfie(registrationToken: string, kycReference: string, selfieImageBase64: string) {
    const { session, ttl } = await this.getRegistrationSession(registrationToken);
    if (!session.kyc || session.kyc.kycReference !== kycReference || !session.kyc.bvnVerified) {
      throw new ApiException("Registration KYC BVN verification required", "REGISTRATION_KYC_BVN_REQUIRED", HttpStatus.BAD_REQUEST);
    }
    const cleaned = selfieImageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
    const uploadedSelfie = await this.cloudinaryService.uploadBase64Image(
      selfieImageBase64,
      "tf/users/kyc-selfies",
      `${kycReference}.jpg`
    );
    if (!session.kyc.bvn) {
      throw new ApiException("Registration KYC BVN verification session expired", "REGISTRATION_KYC_BVN_SESSION_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    const result = await this.kycProvider.verifyBvnWithSelfie(session.kyc.bvn, cleaned, `registration:${registrationToken}`);
    const kyc: RegistrationKycState = {
      ...session.kyc,
      bvn: undefined,
      providerReference: result.providerReference ?? session.kyc.providerReference,
      bvnMasked: result.bvnMasked ?? session.kyc.bvnMasked,
      providerResult: { ...session.kyc.providerResult, ...result },
      selfieVerified: result.selfieVerified,
      faceMatch: result.faceMatch,
      confidenceScore: result.confidenceScore,
      status: result.faceMatch ? KycStatus.verified : KycStatus.rejected,
      selfieImageUrl: uploadedSelfie.secureUrl,
      selfieUploadId: uploadedSelfie.uploadId,
      selfieResult: result
    };
    await this.redis.setJson(`registration:${registrationToken}`, { ...session, kyc }, ttl);
    return {
      kycStatus: result.faceMatch ? "verified" : "rejected",
      faceMatch: result.faceMatch,
      confidenceScore: result.confidenceScore,
      profileImageUrl: result.faceMatch ? uploadedSelfie.secureUrl : result.profileImageUrl
    };
  }

  async completeRegistration(dto: CompleteRegistrationDto, meta: { ipAddress?: string; userAgent?: string }) {
    const session = await this.redis.getJson<RegistrationSession>(`registration:${dto.registrationToken}`);
    if (!session) {
      throw new ApiException("Registration session expired", "REGISTRATION_SESSION_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    if (!session.kyc || session.kyc.status !== KycStatus.verified) {
      throw new ApiException("KYC verification is required to complete registration", "REGISTRATION_KYC_REQUIRED", HttpStatus.BAD_REQUEST);
    }
    const existing = await this.usersRepository.findByPhoneNumber(session.phoneNumber);
    if (existing) throw new ApiException("User already exists", "USER_ALREADY_EXISTS", HttpStatus.CONFLICT);
    const passcodeHash = await bcrypt.hash(dto.passcode, 12);
    const user = await this.usersRepository.createUser(session.phoneNumber, passcodeHash);
    await this.attachRegistrationKyc(user.id, session.kyc);
    await this.autoProvisionAfterRegistrationKyc(user.id);
    await this.redis.del(`registration:${dto.registrationToken}`);
    await this.redis.del(`registration-phone:${session.phoneNumber}`);
    await this.audit(user.id, "USER_REGISTERED", "User", user.id, meta);
    return this.issueMobileTokens(user.id, meta);
  }

  async login(dto: LoginDto, meta: { ipAddress?: string; userAgent?: string }) {
    const phoneNumber = normalizePhoneNumber(dto.phoneNumber);
    const attemptsKey = `login-attempts:${phoneNumber}`;
    const attempts = await this.redis.incrementWithTtl(
      attemptsKey,
      Number(this.config.get<string>("LOGIN_ATTEMPT_TTL_SECONDS", "900"))
    );
    if (attempts > Number(this.config.get<string>("LOGIN_MAX_ATTEMPTS", "5"))) {
      throw new ApiException("Too many login attempts", "LOGIN_RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
    }
    const user = await this.usersRepository.findByPhoneNumber(phoneNumber);
    if (!user || !(await bcrypt.compare(dto.passcode, user.passcodeHash))) {
      throw new ApiException("Invalid phone number or passcode", "INVALID_CREDENTIALS", HttpStatus.UNAUTHORIZED);
    }
    if (user.status !== "active") {
      throw new ApiException("User account is not active", "USER_NOT_ACTIVE", HttpStatus.FORBIDDEN);
    }
    await this.redis.del(attemptsKey);
    await this.audit(user.id, "USER_LOGIN", "User", user.id, meta);
    return this.issueMobileTokens(user.id, meta);
  }

  async refreshToken(refreshToken: string) {
    let payload: { sub: string; sid: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET")
      });
    } catch {
      throw new ApiException("Invalid refresh token", "INVALID_REFRESH_TOKEN", HttpStatus.UNAUTHORIZED);
    }
    if (payload.typ !== "refresh") {
      throw new ApiException("Invalid refresh token", "INVALID_REFRESH_TOKEN", HttpStatus.UNAUTHORIZED);
    }
    const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid } });
    if (!session || session.status !== AuthSessionStatus.active || session.expiresAt < new Date()) {
      throw new ApiException("Refresh token expired", "REFRESH_TOKEN_EXPIRED", HttpStatus.UNAUTHORIZED);
    }
    if (!(await bcrypt.compare(refreshToken, session.refreshTokenHash))) {
      throw new ApiException("Invalid refresh token", "INVALID_REFRESH_TOKEN", HttpStatus.UNAUTHORIZED);
    }
    const accessToken = await this.createAccessToken(payload.sub, session.id);
    return { accessToken };
  }

  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.prisma.authSession.updateMany({
        where: { id: sessionId, userId },
        data: { status: AuthSessionStatus.revoked, revokedAt: new Date() }
      });
    } else {
      await this.prisma.authSession.updateMany({
        where: { userId, status: AuthSessionStatus.active },
        data: { status: AuthSessionStatus.revoked, revokedAt: new Date() }
      });
    }
    await this.audit(userId, "USER_LOGOUT", "User", userId, {});
    return { loggedOut: true };
  }

  async verifyUserPasscode(userId: string, passcode: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user || !(await bcrypt.compare(passcode, user.passcodeHash))) {
      throw new ApiException("Invalid passcode", "INVALID_PASSCODE", HttpStatus.UNAUTHORIZED);
    }
    return true;
  }

  async validateAccessToken(token: string, adminOnly = false) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: adminOnly ? this.config.get<string>("ADMIN_JWT_SECRET") : this.config.get<string>("JWT_ACCESS_SECRET")
      });
      const user = await this.usersRepository.findById(payload.sub);
      if (!user) throw new Error("missing user");
      const adminRoles: UserRole[] = [
        UserRole.ADMIN,
        UserRole.SUPPORT,
        UserRole.COMPLIANCE,
        UserRole.FINANCE,
        UserRole.SUPER_ADMIN
      ];
      if (adminOnly && !adminRoles.includes(user.role)) {
        throw new Error("not admin");
      }
      return { ...payload, role: user.role, phoneNumber: user.phoneNumber };
    } catch {
      throw new ApiException("Unauthorized", "UNAUTHORIZED", HttpStatus.UNAUTHORIZED);
    }
  }

  async issueAdminToken(phoneNumber: string, passcode: string) {
    const user = await this.usersRepository.findByPhoneNumber(normalizePhoneNumber(phoneNumber));
    const adminRoles: UserRole[] = [
      UserRole.ADMIN,
      UserRole.SUPPORT,
      UserRole.COMPLIANCE,
      UserRole.FINANCE,
      UserRole.SUPER_ADMIN
    ];
    if (!user || !adminRoles.includes(user.role)) {
      throw new ApiException("Invalid admin credentials", "INVALID_ADMIN_CREDENTIALS", HttpStatus.UNAUTHORIZED);
    }
    if (!(await bcrypt.compare(passcode, user.passcodeHash))) {
      throw new ApiException("Invalid admin credentials", "INVALID_ADMIN_CREDENTIALS", HttpStatus.UNAUTHORIZED);
    }
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, typ: "admin_access", role: user.role },
      { secret: this.config.get<string>("ADMIN_JWT_SECRET"), expiresIn: this.config.get<string>("JWT_ACCESS_TTL", "15m") }
    );
    await this.audit(user.id, "ADMIN_LOGIN", "User", user.id, {});
    return { accessToken };
  }

  async issueMobileTokens(userId: string, meta: { ipAddress?: string; userAgent?: string }) {
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + Number(this.config.get<string>("JWT_REFRESH_TTL_DAYS", "30")));
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        refreshTokenHash: "pending",
        expiresAt: refreshExpiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent
      }
    });
    const accessToken = await this.createAccessToken(userId, session.id);
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, sid: session.id, typ: "refresh" },
      { secret: this.config.get<string>("JWT_REFRESH_SECRET"), expiresIn: `${this.config.get<string>("JWT_REFRESH_TTL_DAYS", "30")}d` }
    );
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: await bcrypt.hash(refreshToken, 12) }
    });
    const user = await this.usersRepository.findById(userId);
    return {
      accessToken,
      refreshToken,
      user: this.usersService.toContractUser(user!)
    };
  }

  private async createAccessToken(userId: string, sessionId: string) {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, typ: "access" },
      { secret: this.config.get<string>("JWT_ACCESS_SECRET"), expiresIn: this.config.get<string>("JWT_ACCESS_TTL", "15m") }
    );
  }

  private async getRegistrationSession(registrationToken: string) {
    const session = await this.redis.getJson<RegistrationSession>(`registration:${registrationToken}`);
    if (!session) {
      throw new ApiException("Registration session expired", "REGISTRATION_SESSION_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    const ttl = Number(this.config.get<string>("REGISTRATION_TTL_SECONDS", "900"));
    return { session, ttl };
  }

  private async attachRegistrationKyc(userId: string, kyc: RegistrationKycState) {
    const profile = kyc.providerResult;
    const providerLogId = await this.logKycProvider(
      profile.provider,
      "registration_kyc",
      kyc.kycReference,
      kyc.providerReference,
      kyc.status === KycStatus.verified ? "success" : "failed",
      {
        bvn: profile.rawProviderResponse,
        selfie: kyc.selfieResult?.rawProviderResponse
      }
    );
    await this.prisma.$transaction([
      this.prisma.kycRecord.create({
        data: {
          userId,
          kycReference: kyc.kycReference,
          provider: profile.provider,
          providerReference: kyc.providerReference,
          bvnHash: kyc.bvnHash,
          bvnMasked: kyc.bvnMasked,
          bvnVerified: kyc.bvnVerified,
          selfieVerified: kyc.selfieVerified ?? false,
          faceMatch: kyc.faceMatch ?? false,
          confidenceScore: kyc.confidenceScore,
          status: kyc.status,
          firstName: profile.firstName,
          middleName: profile.middleName,
          lastName: profile.lastName,
          email: profile.email,
          phoneNumber: profile.phoneNumber,
          dateOfBirth: parseProviderDate(profile.dateOfBirth),
          gender: profile.gender,
          country: profile.country,
          ninMasked: profile.ninMasked,
          ninHash: profile.ninHash,
          imageUrl: profile.imageUrl,
          profileImageUrl: kyc.selfieImageUrl ?? kyc.selfieResult?.profileImageUrl,
          rawProviderLogId: providerLogId,
          verifiedAt: kyc.status === KycStatus.verified ? new Date() : undefined,
          metadata: {
            ...profile,
            selfie: kyc.selfieResult,
            selfieImageUrl: kyc.selfieImageUrl,
            selfieUploadId: kyc.selfieUploadId
          } as unknown as Prisma.InputJsonObject
        }
      }),
      this.prisma.profile.upsert({
        where: { userId },
        create: {
          userId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          dateOfBirth: parseProviderDate(profile.dateOfBirth),
          gender: profile.gender,
          country: profile.country,
          profileImageUrl: kyc.selfieImageUrl ?? kyc.selfieResult?.profileImageUrl
        },
        update: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          dateOfBirth: parseProviderDate(profile.dateOfBirth),
          gender: profile.gender,
          country: profile.country,
          profileImageUrl: kyc.selfieImageUrl ?? kyc.selfieResult?.profileImageUrl
        }
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { walletStatus: "active" }
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorType: "user",
          action: "REGISTRATION_KYC_ATTACHED",
          entityType: "KycRecord",
          entityId: kyc.kycReference
        }
      })
    ]);
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

  private async autoProvisionAfterRegistrationKyc(userId: string) {
    try {
      await this.walletService.activateWallet(userId);
      const dva = await this.walletService.createDva(userId, "auto");
      const cashDrop = await this.cashDropService.register(userId);
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorType: "system",
          action: "REGISTRATION_KYC_AUTO_PROVISION_COMPLETED",
          entityType: "User",
          entityId: userId,
          metadata: { dvaReady: true, cashDropId: cashDrop.CashDropId, dva }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration KYC auto provisioning failed";
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorType: "system",
          action: "REGISTRATION_KYC_AUTO_PROVISION_FAILED",
          entityType: "User",
          entityId: userId,
          metadata: { message }
        }
      });
    }
  }

  async audit(actorId: string | undefined, action: string, entityType?: string, entityId?: string, meta?: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: actorId ? "user" : "system",
        action,
        entityType,
        entityId,
        metadata: (meta ?? {}) as Prisma.InputJsonObject
      }
    });
  }
}

function parseProviderDate(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
