import { HttpStatus, Injectable } from "@nestjs/common";
import { AuthSessionStatus, CashDropProfileStatus, DvaStatus, UserStatus, WalletStatus } from "@prisma/client";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../prisma/prisma.service";
import { UsersRepository } from "../users/users.repository";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepository: UsersRepository
  ) {}

  listUsers(take = 50, skip = 0) {
    return this.usersRepository.listUsers({ take, skip });
  }

  getUser(id: string) {
    return this.usersRepository.findById(id);
  }

  async deleteUser(adminId: string, userId: string, reason?: string) {
    if (adminId === userId) {
      throw new ApiException("Admin cannot delete their own account", "ADMIN_CANNOT_DELETE_SELF", HttpStatus.BAD_REQUEST);
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new ApiException("User not found", "USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.disabled, walletStatus: WalletStatus.inactive }
      }),
      this.prisma.authSession.updateMany({
        where: { userId, status: AuthSessionStatus.active },
        data: { status: AuthSessionStatus.revoked, revokedAt: now }
      }),
      this.prisma.userDeviceToken.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false }
      }),
      this.prisma.trustedDevice.updateMany({
        where: { userId, enabled: true },
        data: { enabled: false, disabledAt: now }
      }),
      this.prisma.dedicatedVirtualAccount.updateMany({
        where: { userId, status: DvaStatus.active },
        data: { status: DvaStatus.inactive }
      }),
      this.prisma.cashDropProfile.updateMany({
        where: { userId, status: CashDropProfileStatus.active },
        data: { status: CashDropProfileStatus.disabled, disabledAt: now }
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          actorType: "admin",
          action: "ADMIN_USER_DELETED",
          entityType: "User",
          entityId: userId,
          metadata: { reason: reason ?? null, softDelete: true }
        }
      })
    ]);
    return { deleted: true, userId, status: UserStatus.disabled };
  }

  listAuthSessions(take = 50, skip = 0) {
    return this.prisma.authSession.findMany({
      take,
      skip,
      select: {
        id: true,
        userId: true,
        status: true,
        userAgent: true,
        ipAddress: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  listAuditLogs(take = 50, skip = 0) {
    return this.prisma.auditLog.findMany({
      take,
      skip,
      orderBy: { createdAt: "desc" }
    });
  }

  async auditAdminView(adminId: string, action: string, entityType: string, entityId?: string) {
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: "admin",
        action,
        entityType,
        entityId
      }
    });
  }
}
