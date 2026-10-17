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
import { KycProvider, SelfieValidationResult } from "../providers/interfaces/kyc-provider.interface";
import { KYC_PROVIDER, SELFIE_KYC_PROVIDER } from "../providers/provider.tokens";
import { RedisService } from "../redis/redis.service";
import { OtpService } from "../otp/otp.service";
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
    @Inject(SELFIE_KYC_PROVIDER) private readonly selfieKycProvider: KycProvider,
    private readonly cloudinaryService: CloudinaryService,
    private readonly walletService: WalletService,
    private readonly cashDropService: CashDropService,
    private readonly otpService: OtpService
  ) {}

  async startRegistration(phoneNumber: string) {
    const normalized = normalizePhoneNumber(phoneNumber);
    const [existing, existingToken] = await Promise.all([
      this.usersRepository.findByPhoneNumber(normalized),
      this.redis.getJson<string>(`registration-phone:${normalized}`)
    ]);
    if (existing) throw this.phoneAlreadyRegistered();
    const registrationToken = existingToken ?? `reg_temp_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const ttl = Number(this.config.get<string>("REGISTRATION_TTL_SECONDS", "900"));
    let registrationWrite: Promise<unknown> = Promise.resolve();
    if (!existingToken) {
      const session: RegistrationSession = {
        phoneNumber: normalized,
        requiresOtp: true,
        createdAt: new Date().toISOString()
      };
      registrationWrite = Promise.all([
        this.redis.setJson(`registration:${registrationToken}`, session, ttl),
        this.redis.setJson(`registration-phone:${normalized}`, registrationToken, ttl)
      ]);
    }
    const [, challenge] = await Promise.all([
      registrationWrite,
      this.otpService.sendOtp(normalized)
    ]);
    return {
      registrationToken,
      phoneNumber: normalized,
      requiresOtp: true,
      otpReference: challenge.otpReference
    };
  }

  async verifyRegistrationBvn(registrationToken: string, bvn: string) {
    const { session, ttl } = await this.getRegistrationSession(registrationToken);
    const bvnHash = sha256(bvn);
    await this.ensureBvnIsAvailable(bvnHash);
    const kycReference = `kyc_ref_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const result = await this.kycProvider.verifyBvn(bvn, `registration:${registrationToken}`, {
      phoneNumber: session.phoneNumber,
      reference: kycReference
    });
    const kyc: RegistrationKycState = {
      kycReference,
      providerReference: result.providerReference,
      bvnHash,
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
    const bvnProfile = session.kyc.providerResult;
    const result = await this.selfieKycProvider.verifyBvnWithSelfie(session.kyc.bvn, cleaned, `registration:${registrationToken}`, {
      phoneNumber: session.phoneNumber,
      firstName: bvnProfile.firstName,
      middleName: bvnProfile.middleName,
      lastName: bvnProfile.lastName,
      dateOfBirth: bvnProfile.dateOfBirth,
      reference: selfieProviderReference(kycReference)
    });
    const kyc: RegistrationKycState = {
      ...session.kyc,
      bvn: result.faceMatch ? undefined : session.kyc.bvn,
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
      faceMatchStatus: result.faceMatchStatus,
      faceMatchReason: result.faceMatchReason,
      livenessStatus: result.livenessStatus,
      profileImageUrl: result.faceMatch ? uploadedSelfie.secureUrl : result.profileImageUrl
    };
  }

  async startRegistrationLiveness(registrationToken: string, kycReference: string) {
    const { session, ttl } = await this.getRegistrationSession(registrationToken);
    const current = this.requireRegistrationKyc(session, kycReference);
    if (this.cashDropService.getKycSelfieMode() !== "bytid_liveness") {
      throw new ApiException("BytID liveness is not enabled", "KYC_LIVENESS_NOT_ENABLED", HttpStatus.CONFLICT);
    }
    if (!this.selfieKycProvider.createLivenessSession) {
      throw new ApiException("The configured selfie provider does not support liveness", "KYC_LIVENESS_UNSUPPORTED", HttpStatus.NOT_IMPLEMENTED);
    }
    if (
      current.livenessStatus === "pending" &&
      current.livenessSessionId &&
      current.livenessUrl &&
      (!current.livenessExpiresAt || new Date(current.livenessExpiresAt).getTime() > Date.now())
    ) {
      return {
        livenessSessionId: current.livenessSessionId,
        status: current.livenessStatus,
        url: current.livenessUrl,
        expiresAt: current.livenessExpiresAt
      };
    }

    const reference = livenessProviderReference(kycReference);
    const result = await this.selfieKycProvider.createLivenessSession(this.livenessRedirectUrl(), { reference });
    if (result.reference && result.reference !== reference) {
      throw new ApiException("BytID returned a mismatched liveness reference", "BYTID_LIVENESS_REFERENCE_MISMATCH", HttpStatus.BAD_GATEWAY);
    }
    const kyc: RegistrationKycState = {
      ...current,
      livenessSessionId: result.id,
      livenessReference: reference,
      livenessUrl: result.url,
      livenessStatus: result.status,
      livenessExpiresAt: result.expiresAt
    };
    await this.redis.setJson(`registration:${registrationToken}`, { ...session, kyc }, ttl);
    return {
      livenessSessionId: result.id,
      status: result.status,
      url: result.url,
      expiresAt: result.expiresAt
    };
  }

  async completeRegistrationLiveness(
    registrationToken: string,
    kycReference: string,
    livenessSessionId: string,
    profileImageBase64: string
  ) {
    const { session, ttl } = await this.getRegistrationSession(registrationToken);
    const current = this.requireRegistrationKyc(session, kycReference);
    if (current.livenessSessionId !== livenessSessionId) {
      throw new ApiException("Liveness session does not belong to this registration", "KYC_LIVENESS_SESSION_MISMATCH", HttpStatus.BAD_REQUEST);
    }
    if (current.faceMatch && current.selfieResult?.livenessStatus === "passed") {
      return this.registrationSelfieResponse(current.selfieResult, current.selfieImageUrl);
    }
    if (!current.bvn) {
      throw new ApiException("Registration KYC BVN verification session expired", "REGISTRATION_KYC_BVN_SESSION_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    if (!this.selfieKycProvider.getLivenessSession || !this.selfieKycProvider.verifyBvnWithLiveness) {
      throw new ApiException("The configured selfie provider does not support liveness", "KYC_LIVENESS_UNSUPPORTED", HttpStatus.NOT_IMPLEMENTED);
    }

    const liveness = await this.selfieKycProvider.getLivenessSession(livenessSessionId);
    if (liveness.reference && current.livenessReference && liveness.reference !== current.livenessReference) {
      throw new ApiException("BytID returned a mismatched liveness reference", "BYTID_LIVENESS_REFERENCE_MISMATCH", HttpStatus.BAD_GATEWAY);
    }
    if (liveness.status === "pending") {
      await this.redis.setJson(
        `registration:${registrationToken}`,
        { ...session, kyc: { ...current, livenessStatus: "pending" } },
        ttl
      );
      return {
        kycStatus: "pending",
        faceMatch: false,
        confidenceScore: 0,
        faceMatchStatus: "pending",
        faceMatchReason: "Complete the BytID live face check to continue.",
        livenessStatus: "pending"
      };
    }
    if (liveness.status !== "passed" || !liveness.usableForFaceMatch) {
      const reason = liveness.reasons.length
        ? `The live face check failed: ${liveness.reasons.join(", ").replace(/_/g, " ")}.`
        : `The live face check ${liveness.status}. Please try again.`;
      await this.redis.setJson(
        `registration:${registrationToken}`,
        { ...session, kyc: { ...current, status: KycStatus.rejected, livenessStatus: liveness.status, livenessUrl: undefined } },
        ttl
      );
      return {
        kycStatus: "rejected",
        faceMatch: false,
        confidenceScore: liveness.score ?? 0,
        faceMatchStatus: "unavailable",
        faceMatchReason: reason,
        livenessStatus: liveness.status
      };
    }

    const storedPhoto = await this.cloudinaryService.uploadBase64Image(
      profileImageBase64,
      "tf/users/kyc-selfies",
      `${kycReference}-camera.jpg`
    );
    const bvnProfile = current.providerResult;
    const result = await this.selfieKycProvider.verifyBvnWithLiveness(
      current.bvn,
      livenessSessionId,
      `registration:${registrationToken}`,
      {
        phoneNumber: session.phoneNumber,
        firstName: bvnProfile.firstName,
        middleName: bvnProfile.middleName,
        lastName: bvnProfile.lastName,
        dateOfBirth: bvnProfile.dateOfBirth,
        reference: selfieProviderReference(kycReference)
      }
    );
    const safeResult: SelfieValidationResult = {
      ...result,
      imageUrl: isHttpUrl(result.imageUrl) ? result.imageUrl : undefined,
      profileImageUrl: result.faceMatch ? storedPhoto.secureUrl : result.profileImageUrl
    };
    const kyc: RegistrationKycState = {
      ...current,
      bvn: result.faceMatch ? undefined : current.bvn,
      providerReference: result.providerReference ?? current.providerReference,
      bvnMasked: result.bvnMasked ?? current.bvnMasked,
      providerResult: { ...current.providerResult, ...safeResult },
      selfieVerified: result.selfieVerified,
      faceMatch: result.faceMatch,
      confidenceScore: result.confidenceScore,
      status: result.faceMatch ? KycStatus.verified : KycStatus.rejected,
      selfieImageUrl: result.faceMatch ? storedPhoto.secureUrl : safeResult.profileImageUrl,
      selfieUploadId: result.faceMatch ? storedPhoto.uploadId : undefined,
      selfieResult: safeResult,
      livenessStatus: result.livenessStatus ?? liveness.status,
      livenessUrl: undefined
    };
    await this.redis.setJson(`registration:${registrationToken}`, { ...session, kyc }, ttl);
    return this.registrationSelfieResponse(safeResult, kyc.selfieImageUrl);
  }

  async getRegistrationLivenessStatus(
    registrationToken: string,
    kycReference: string,
    livenessSessionId: string
  ) {
    const { session, ttl } = await this.getRegistrationSession(registrationToken);
    const current = this.requireRegistrationKyc(session, kycReference);
    if (current.livenessSessionId !== livenessSessionId) {
      throw new ApiException("Liveness session does not belong to this registration", "KYC_LIVENESS_SESSION_MISMATCH", HttpStatus.BAD_REQUEST);
    }
    if (!this.selfieKycProvider.getLivenessSession) {
      throw new ApiException("The configured selfie provider does not support liveness", "KYC_LIVENESS_UNSUPPORTED", HttpStatus.NOT_IMPLEMENTED);
    }
    const result = await this.selfieKycProvider.getLivenessSession(livenessSessionId);
    if (result.reference && current.livenessReference && result.reference !== current.livenessReference) {
      throw new ApiException("BytID returned a mismatched liveness reference", "BYTID_LIVENESS_REFERENCE_MISMATCH", HttpStatus.BAD_GATEWAY);
    }
    await this.redis.setJson(
      `registration:${registrationToken}`,
      {
        ...session,
        kyc: {
          ...current,
          status: ["failed", "expired"].includes(result.status) ? KycStatus.rejected : current.status,
          livenessStatus: result.status,
          livenessUrl: result.status === "pending" ? current.livenessUrl : undefined
        }
      },
      ttl
    );
    return {
      livenessSessionId: result.id,
      status: result.status,
      score: result.score,
      reasons: result.reasons,
      usableForFaceMatch: result.usableForFaceMatch,
      expiresAt: result.expiresAt
    };
  }

  async completeRegistration(dto: CompleteRegistrationDto, meta: { ipAddress?: string; userAgent?: string }) {
    const session = await this.redis.getJson<RegistrationSession>(`registration:${dto.registrationToken}`);
    if (!session) {
      throw new ApiException("Registration session expired", "REGISTRATION_SESSION_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    if (!session.kyc || !this.isRegistrationKycComplete(session.kyc.status)) {
      throw new ApiException("KYC verification is required to complete registration", "REGISTRATION_KYC_REQUIRED", HttpStatus.BAD_REQUEST);
    }
    const [existing, duplicateBvn] = await Promise.all([
      this.usersRepository.findByPhoneNumber(session.phoneNumber),
      this.findVerifiedBvn(session.kyc.bvnHash)
    ]);
    if (existing) throw this.phoneAlreadyRegistered();
    if (duplicateBvn) throw this.bvnAlreadyRegistered();
    const passcodeHash = await bcrypt.hash(dto.passcode, 12);
    let user;
    try {
      user = await this.usersRepository.createUser(session.phoneNumber, passcodeHash);
    } catch (error) {
      if (this.isUniqueConstraint(error, "phoneNumber")) throw this.phoneAlreadyRegistered();
      throw error;
    }
    try {
      await this.attachRegistrationKyc(user.id, {
        ...session.kyc,
        status: session.kyc.status === KycStatus.bvn_verified && !this.isSelfieKycRequired()
          ? KycStatus.verified
          : session.kyc.status
      });
    } catch (error) {
      await this.prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      if (this.isUniqueConstraint(error, "bvnHash")) throw this.bvnAlreadyRegistered();
      throw error;
    }
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

  faceUnlockConfig() {
    const seconds = Number(this.config.get<string>("FACE_UNLOCK_COUNTDOWN_SECONDS", "5"));
    return {
      enabled: this.cashDropService.isEnabled() && ["1", "true", "yes", "on"].includes(
        this.config.get<string>("FACE_UNLOCK_ENABLED", "true").toLowerCase()
      ),
      countdownEnabled: ["1", "true", "yes", "on"].includes(
        this.config.get<string>("FACE_UNLOCK_COUNTDOWN_ENABLED", "true").toLowerCase()
      ),
      countdownSeconds: Number.isFinite(seconds) ? Math.min(10, Math.max(1, Math.round(seconds))) : 5,
      maxAttempts: this.faceUnlockMaxAttempts(),
      lockoutSeconds: this.faceUnlockLockoutSeconds()
    };
  }

  private faceUnlockMaxAttempts() {
    const configured = Number(this.config.get<string>("FACE_UNLOCK_MAX_ATTEMPTS", "3"));
    return Number.isFinite(configured) ? Math.min(10, Math.max(1, Math.round(configured))) : 3;
  }

  private faceUnlockLockoutSeconds() {
    const configured = Number(this.config.get<string>("FACE_UNLOCK_LOCKOUT_SECONDS", "3600"));
    return Number.isFinite(configured) ? Math.max(60, Math.round(configured)) : 3600;
  }

  async faceUnlock(
    phoneNumber: string,
    faceImageBase64: string,
    meta: { ipAddress?: string; userAgent?: string }
  ) {
    const config = this.faceUnlockConfig();
    if (!config.enabled) {
      throw new ApiException("Face unlock is disabled", "FACE_UNLOCK_DISABLED", HttpStatus.FORBIDDEN);
    }
    const normalized = normalizePhoneNumber(phoneNumber);
    const attemptsKey = `face-unlock-attempts:${normalized}`;
    const attempts = (await this.redis.getJson<number>(attemptsKey)) ?? 0;
    if (attempts >= config.maxAttempts) {
      throw new ApiException(
        `Face unlock is locked after ${config.maxAttempts} failed attempts`,
        "FACE_UNLOCK_LOCKED",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const user = await this.usersRepository.findByPhoneNumber(normalized);
    const result = user?.status === "active"
      ? await this.cashDropService.matchRegisteredFace(user.id, faceImageBase64)
      : { matched: false, confidence: 0, threshold: 0 };
    if (!user || !result.matched) {
      const failedAttempts = await this.redis.incrementWithTtl(attemptsKey, config.lockoutSeconds);
      await this.audit(user?.id, "FACE_UNLOCK_FAILED", "User", user?.id, {
        confidence: result.confidence,
        failedAttempts
      });
      if (failedAttempts >= config.maxAttempts) {
        await this.redis.setJson(attemptsKey, failedAttempts, config.lockoutSeconds);
        throw new ApiException(
          `Face unlock is locked after ${config.maxAttempts} failed attempts`,
          "FACE_UNLOCK_LOCKED",
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      throw new ApiException("Face not recognized", "FACE_UNLOCK_FAILED", HttpStatus.UNAUTHORIZED);
    }

    await this.redis.del(attemptsKey);
    await this.audit(user.id, "FACE_UNLOCK_SUCCESS", "User", user.id, {
      confidence: result.confidence
    });
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
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + Number(this.config.get<string>("JWT_REFRESH_TTL_DAYS", "3")));
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
      { secret: this.config.get<string>("JWT_REFRESH_SECRET"), expiresIn: `${this.config.get<string>("JWT_REFRESH_TTL_DAYS", "3")}d` }
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

  private findVerifiedBvn(bvnHash: string) {
    return this.prisma.kycRecord.findFirst({
      where: { bvnHash, bvnVerified: true },
      select: { id: true }
    });
  }

  private async ensureBvnIsAvailable(bvnHash: string) {
    if (await this.findVerifiedBvn(bvnHash)) throw this.bvnAlreadyRegistered();
  }

  private phoneAlreadyRegistered() {
    return new ApiException(
      "This phone number is already registered. Log in instead.",
      "PHONE_NUMBER_ALREADY_REGISTERED",
      HttpStatus.CONFLICT
    );
  }

  private bvnAlreadyRegistered() {
    return new ApiException(
      "This BVN is already registered to a Transfa account.",
      "BVN_ALREADY_REGISTERED",
      HttpStatus.CONFLICT
    );
  }

  private isUniqueConstraint(error: unknown, field: string) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
    const target = error.meta?.target;
    return Array.isArray(target)
      ? target.some((value) => String(value).includes(field))
      : String(target ?? "").includes(field);
  }

  private isSelfieKycRequired() {
    return ["1", "true", "yes", "on"].includes(this.config.get<string>("KYC_SELFIE_REQUIRED", "true").toLowerCase());
  }

  private requireRegistrationKyc(session: RegistrationSession, kycReference: string) {
    if (!session.kyc || session.kyc.kycReference !== kycReference || !session.kyc.bvnVerified) {
      throw new ApiException("Registration KYC BVN verification required", "REGISTRATION_KYC_BVN_REQUIRED", HttpStatus.BAD_REQUEST);
    }
    return session.kyc;
  }

  private livenessRedirectUrl() {
    const value = this.config.get<string>("BYTID_LIVENESS_REDIRECT_URL", "").trim();
    if (!/^https:\/\//i.test(value)) {
      throw new ApiException("BytID liveness redirect URL is not configured", "BYTID_LIVENESS_REDIRECT_URL_MISSING", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return value;
  }

  private registrationSelfieResponse(result: SelfieValidationResult, profileImageUrl?: string) {
    return {
      kycStatus: result.faceMatch ? "verified" : "rejected",
      faceMatch: result.faceMatch,
      confidenceScore: result.confidenceScore,
      faceMatchStatus: result.faceMatchStatus,
      faceMatchReason: result.faceMatchReason,
      livenessStatus: result.livenessStatus,
      profileImageUrl: result.faceMatch ? profileImageUrl ?? result.profileImageUrl : result.profileImageUrl
    };
  }

  private isRegistrationKycComplete(status: KycStatus) {
    return status === KycStatus.verified || (!this.isSelfieKycRequired() && status === KycStatus.bvn_verified);
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
      const cashDrop = this.cashDropService.isEnabled() ? await this.cashDropService.register(userId) : undefined;
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          actorType: "system",
          action: "REGISTRATION_KYC_AUTO_PROVISION_COMPLETED",
          entityType: "User",
          entityId: userId,
          metadata: { dvaReady: true, cashDropEnabled: this.cashDropService.isEnabled(), cashDropId: cashDrop?.CashDropId, dva }
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

function selfieProviderReference(kycReference: string) {
  return `${kycReference}:selfie:${uuid().replace(/-/g, "").slice(0, 10)}`;
}

function livenessProviderReference(kycReference: string) {
  return `${kycReference}:live:${uuid().replace(/-/g, "").slice(0, 10)}`;
}

function isHttpUrl(value?: string) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function parseProviderDate(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
