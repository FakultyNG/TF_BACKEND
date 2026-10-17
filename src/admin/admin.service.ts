import { HttpStatus, Injectable } from "@nestjs/common";
import { AuthSessionStatus, CashDropProfileStatus, DvaStatus, Prisma, TransactionStatus, UserRole, UserStatus, WalletStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../prisma/prisma.service";
import { UsersRepository } from "../users/users.repository";
import { normalizePhoneNumber } from "../common/utils/phone.util";
import { ADMIN_PERMISSIONS, permissionsFor } from "./admin-permissions";
import { CreateAdminDto } from "./dto/create-admin.dto";
import { UpdateAdminDto } from "./dto/update-admin.dto";

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

  async dashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [users, activeUsers, walletAggregate, todayTransactions, openConversations, recentTransactions] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.USER } }),
      this.prisma.user.count({ where: { role: UserRole.USER, status: UserStatus.active } }),
      this.prisma.wallet.aggregate({ _sum: { balance: true }, where: { status: WalletStatus.active } }),
      this.prisma.transaction.count({ where: { createdAt: { gte: today } } }),
      this.prisma.supportTicket.count({ where: { status: { in: ["open", "pending", "reopened"] } } }),
      this.prisma.transaction.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { phoneNumber: true, profile: true } } }
      })
    ]);
    const successfulToday = await this.prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: today }, status: TransactionStatus.successful }
    });
    return {
      summary: {
        users,
        activeUsers,
        walletBalance: walletAggregate._sum.balance ?? 0,
        todayTransactions,
        todayVolume: successfulToday._sum.amount ?? 0,
        openConversations
      },
      recentTransactions
    };
  }

  async me(adminId: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, phoneNumber: true, role: true, status: true, profile: true, adminProfile: true }
    });
    if (!admin) throw new ApiException("Admin not found", "ADMIN_NOT_FOUND", HttpStatus.NOT_FOUND);
    return {
      ...admin,
      permissions: permissionsFor(admin.role, admin.adminProfile?.permissions)
    };
  }

  async listAdmins() {
    const roles = [UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN];
    const items = await this.prisma.user.findMany({
      where: { role: { in: roles } },
      select: { id: true, phoneNumber: true, role: true, status: true, createdAt: true, profile: true, adminProfile: true },
      orderBy: { createdAt: "desc" }
    });
    return {
      items: items.map((admin) => ({
        ...admin,
        permissions: permissionsFor(admin.role, admin.adminProfile?.permissions)
      })),
      availablePermissions: ADMIN_PERMISSIONS
    };
  }

  async createAdmin(creatorId: string, dto: CreateAdminDto) {
    const allowedRoles: UserRole[] = [UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE];
    if (!allowedRoles.includes(dto.role)) {
      throw new ApiException("SUPER_ADMIN accounts can only be created from the environment bootstrap", "ADMIN_ROLE_NOT_ALLOWED", HttpStatus.BAD_REQUEST);
    }
    const phoneNumber = normalizePhoneNumber(dto.phoneNumber);
    if (await this.prisma.user.findUnique({ where: { phoneNumber }, select: { id: true } })) {
      throw new ApiException("Phone number is already registered", "PHONE_ALREADY_REGISTERED", HttpStatus.CONFLICT);
    }
    const passcodeHash = await bcrypt.hash(dto.passcode, 12);
    const admin = await this.prisma.user.create({
      data: {
        phoneNumber,
        passcodeHash,
        role: dto.role,
        status: UserStatus.active,
        profile: { create: { firstName: dto.firstName, lastName: dto.lastName, email: dto.email, country: "Nigeria" } },
        adminProfile: { create: { permissions: dto.permissions, createdById: creatorId } }
      },
      select: { id: true, phoneNumber: true, role: true, status: true, profile: true, adminProfile: true }
    });
    await this.audit(creatorId, "ADMIN_ACCOUNT_CREATED", "User", admin.id, { role: dto.role, permissions: dto.permissions });
    return admin;
  }

  async updateAdmin(actorId: string, adminId: string, dto: UpdateAdminDto) {
    if (actorId === adminId && dto.isActive === false) {
      throw new ApiException("You cannot disable your own admin account", "ADMIN_CANNOT_DISABLE_SELF", HttpStatus.BAD_REQUEST);
    }
    const existing = await this.prisma.user.findUnique({ where: { id: adminId }, include: { adminProfile: true } });
    if (!existing || existing.role === UserRole.USER) {
      throw new ApiException("Admin not found", "ADMIN_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    if (existing.role === UserRole.SUPER_ADMIN && dto.role && dto.role !== UserRole.SUPER_ADMIN) {
      throw new ApiException("The environment super-admin role cannot be changed", "SUPER_ADMIN_PROTECTED", HttpStatus.BAD_REQUEST);
    }
    const passcodeHash = dto.passcode ? await bcrypt.hash(dto.passcode, 12) : undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: adminId }, data: { role: dto.role, passcodeHash } });
      if (dto.firstName !== undefined || dto.lastName !== undefined) {
        await tx.profile.upsert({
          where: { userId: adminId },
          create: { userId: adminId, firstName: dto.firstName, lastName: dto.lastName },
          update: { firstName: dto.firstName, lastName: dto.lastName }
        });
      }
      await tx.adminProfile.upsert({
        where: { userId: adminId },
        create: { userId: adminId, permissions: dto.permissions ?? [], isActive: dto.isActive ?? true, createdById: actorId },
        update: { permissions: dto.permissions, isActive: dto.isActive }
      });
      if (dto.isActive === false) {
        await tx.authSession.updateMany({
          where: { userId: adminId, status: AuthSessionStatus.active },
          data: { status: AuthSessionStatus.revoked, revokedAt: new Date() }
        });
      }
    });
    await this.audit(actorId, "ADMIN_ACCOUNT_UPDATED", "User", adminId, dto as unknown as Prisma.InputJsonObject);
    return this.me(adminId);
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

  private audit(actorId: string, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject) {
    return this.prisma.auditLog.create({ data: { actorId, actorType: "admin", action, entityType, entityId, metadata } });
  }
}
