import { HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "../common/errors/api.exception";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { EnableBiometricDto } from "./dto/enable-biometric.dto";

@Injectable()
export class BiometricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly redis: RedisService
  ) {}

  async getStatus(userId: string, deviceId?: string) {
    const device = await this.prisma.trustedDevice.findFirst({
      where: { userId, deviceId: deviceId || undefined },
      orderBy: { updatedAt: "desc" }
    });
    return {
      enabled: device?.enabled ?? false,
      method: device?.method ?? "unknown",
      deviceId: device?.deviceId ?? deviceId ?? null
    };
  }

  async enable(userId: string, dto: EnableBiometricDto) {
    const device = await this.prisma.trustedDevice.upsert({
      where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
      create: { userId, deviceId: dto.deviceId, method: dto.method, enabled: true },
      update: { method: dto.method, enabled: true, disabledAt: null }
    });
    await this.securityAudit(userId, "BIOMETRIC_ENABLED", dto.deviceId);
    return { enabled: true, method: device.method, deviceId: device.deviceId };
  }

  async disable(userId: string, deviceId: string) {
    await this.prisma.trustedDevice.updateMany({
      where: { userId, deviceId },
      data: { enabled: false, disabledAt: new Date() }
    });
    await this.securityAudit(userId, "BIOMETRIC_DISABLED", deviceId);
    return { enabled: false };
  }

  async login(deviceId: string, meta: { ipAddress?: string; userAgent?: string }) {
    const attemptsKey = `biometric-login-attempts:${deviceId}`;
    const attempts = await this.redis.incrementWithTtl(attemptsKey, 900);
    if (attempts > 5) {
      throw new ApiException("Too many biometric login attempts", "BIOMETRIC_LOGIN_RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
    }
    const device = await this.prisma.trustedDevice.findUnique({
      where: { deviceId },
      include: { user: { include: { profile: true, kycRecords: { orderBy: { createdAt: "desc" }, take: 1 } } } }
    });
    if (!device || !device.enabled) {
      throw new ApiException("Biometric login is not enabled", "BIOMETRIC_NOT_ENABLED", HttpStatus.UNAUTHORIZED);
    }
    await this.prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
    await this.redis.del(attemptsKey);
    await this.securityAudit(device.userId, "BIOMETRIC_LOGIN", deviceId, meta);
    return this.authService.issueMobileTokens(device.userId, meta);
  }

  async listUserDevices(userId: string) {
    return this.prisma.trustedDevice.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, deviceId: true, method: true, enabled: true, lastUsedAt: true, createdAt: true, disabledAt: true }
    });
  }

  async revokeDevice(adminId: string, userId: string, deviceId: string) {
    const updated = await this.prisma.trustedDevice.updateMany({
      where: { userId, deviceId },
      data: { enabled: false, disabledAt: new Date() }
    });
    if (!updated.count) throw new ApiException("Trusted device not found", "TRUSTED_DEVICE_NOT_FOUND", HttpStatus.NOT_FOUND);
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: "admin",
        action: "ADMIN_TRUSTED_DEVICE_REVOKED",
        entityType: "TrustedDevice",
        entityId: deviceId,
        metadata: { userId, deviceId }
      }
    });
    await this.securityAudit(userId, "ADMIN_BIOMETRIC_DEVICE_REVOKED", deviceId);
    return { enabled: false, deviceId };
  }

  private securityAudit(userId: string | undefined, action: string, deviceId?: string, meta?: { ipAddress?: string; userAgent?: string }) {
    return this.prisma.securityAudit.create({
      data: { userId, action, deviceId, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent }
    });
  }
}
