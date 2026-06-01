import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AuthSessionStatus, Prisma, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { ApiException } from "../common/errors/api.exception";
import { sha256 } from "../common/utils/hash.util";
import { normalizePhoneNumber } from "../common/utils/phone.util";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { UsersRepository } from "../users/users.repository";
import { UsersService } from "../users/users.service";
import { CompleteRegistrationDto } from "./dto/complete-registration.dto";
import { LoginDto } from "./dto/login.dto";
import { RegistrationSession } from "./types/registration-session";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepository: UsersRepository,
    private readonly usersService: UsersService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
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

  async completeRegistration(dto: CompleteRegistrationDto, meta: { ipAddress?: string; userAgent?: string }) {
    const session = await this.redis.getJson<RegistrationSession>(`registration:${dto.registrationToken}`);
    if (!session) {
      throw new ApiException("Registration session expired", "REGISTRATION_SESSION_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    const existing = await this.usersRepository.findByPhoneNumber(session.phoneNumber);
    if (existing) throw new ApiException("User already exists", "USER_ALREADY_EXISTS", HttpStatus.CONFLICT);
    const passcodeHash = await bcrypt.hash(dto.passcode, 12);
    const user = await this.usersRepository.createUser(session.phoneNumber, passcodeHash);
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
