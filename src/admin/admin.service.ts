import { HttpStatus, Injectable } from "@nestjs/common";
import { AuthSessionStatus, CashDropProfileStatus, DvaStatus, Prisma, TransactionStatus, UserRole, UserStatus, WalletStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../prisma/prisma.service";
import { UsersRepository } from "../users/users.repository";
import { normalizePhoneNumber } from "../common/utils/phone.util";
import { ADMIN_PERMISSIONS, permissionsFor } from "./admin-permissions";
import { AdminDeleteUserDto } from "./dto/admin-delete-user.dto";
import { AdminUpdateUserDto } from "./dto/admin-update-user.dto";
import { AdminUpdateUserStatusDto } from "./dto/admin-update-user-status.dto";
import { CreateAdminDto } from "./dto/create-admin.dto";
import { UpdateAdminDto } from "./dto/update-admin.dto";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepository: UsersRepository
  ) {}

  listUsers(take = 50, skip = 0) {
    return this.usersRepository.listUsers({ take, skip, role: UserRole.USER });
  }

  async getUser(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user || user.role !== UserRole.USER) {
      throw new ApiException("User not found", "USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return user;
  }

  async updateUser(adminId: string, userId: string, dto: AdminUpdateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, phoneNumber: true, status: true }
    });
    if (!existing || existing.role !== UserRole.USER) {
      throw new ApiException("User not found", "USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const phoneNumber = dto.phoneNumber ? normalizePhoneNumber(dto.phoneNumber) : undefined;
    if (phoneNumber && phoneNumber !== existing.phoneNumber) {
      const duplicate = await this.prisma.user.findUnique({ where: { phoneNumber }, select: { id: true } });
      if (duplicate) {
        throw new ApiException("Phone number is already registered", "PHONE_ALREADY_REGISTERED", HttpStatus.CONFLICT);
      }
    }
    if (dto.walletStatus === WalletStatus.active && existing.status !== UserStatus.active) {
      throw new ApiException(
        "Restore the customer account before activating its wallet",
        "USER_NOT_ACTIVE",
        HttpStatus.CONFLICT
      );
    }

    const profileFields = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      gender: dto.gender,
      country: dto.country,
      profileImageUrl: dto.profileImageUrl
    };
    const profileChanged = Object.values(profileFields).some((value) => value !== undefined);
    const changedFields = Object.entries(dto).filter(([, value]) => value !== undefined).map(([key]) => key);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          phoneNumber,
          accountTier: dto.accountTier,
          walletStatus: dto.walletStatus,
          supportNotes: dto.supportNotes,
          riskNotes: dto.riskNotes
        }
      });
      if (profileChanged) {
        await tx.profile.upsert({
          where: { userId },
          create: { userId, ...profileFields },
          update: profileFields
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorType: "admin",
          action: "ADMIN_USER_DETAILS_UPDATED",
          entityType: "User",
          entityId: userId,
          metadata: { changedFields }
        }
      });
    });
    return this.getUser(userId);
  }

  async updateUserStatus(adminId: string, userId: string, dto: AdminUpdateUserStatusDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        kycRecords: { select: { status: true }, orderBy: { createdAt: "desc" }, take: 1 }
      }
    });
    if (!user || user.role !== UserRole.USER) {
      throw new ApiException("User not found", "USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const now = new Date();
    const restoring = dto.status === UserStatus.active;
    const verified = user.kycRecords[0]?.status === "verified";
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          status: dto.status,
          walletStatus: restoring && verified ? WalletStatus.active : WalletStatus.inactive
        }
      });
      if (restoring) {
        if (verified) {
          await tx.dedicatedVirtualAccount.updateMany({
            where: { userId, status: DvaStatus.inactive },
            data: { status: DvaStatus.active }
          });
          await tx.cashDropProfile.updateMany({
            where: { userId, status: CashDropProfileStatus.disabled },
            data: { status: CashDropProfileStatus.active, disabledAt: null }
          });
        }
      } else {
        await tx.authSession.updateMany({
          where: { userId, status: AuthSessionStatus.active },
          data: { status: AuthSessionStatus.revoked, revokedAt: now }
        });
        await tx.userDeviceToken.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
        await tx.trustedDevice.updateMany({
          where: { userId, enabled: true },
          data: { enabled: false, disabledAt: now }
        });
        await tx.dedicatedVirtualAccount.updateMany({
          where: { userId, status: DvaStatus.active },
          data: { status: DvaStatus.inactive }
        });
        await tx.cashDropProfile.updateMany({
          where: { userId, status: CashDropProfileStatus.active },
          data: { status: CashDropProfileStatus.disabled, disabledAt: now }
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorType: "admin",
          action: "ADMIN_USER_STATUS_UPDATED",
          entityType: "User",
          entityId: userId,
          metadata: { previousStatus: user.status, status: dto.status, reason: dto.reason ?? null }
        }
      });
    });
    return this.getUser(userId);
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

  async deleteUser(adminId: string, userId: string, dto: AdminDeleteUserDto) {
    if (adminId === userId) {
      throw new ApiException("Admin cannot delete their own account", "ADMIN_CANNOT_DELETE_SELF", HttpStatus.BAD_REQUEST);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        phoneNumber: true,
        _count: { select: { transactions: true, kycRecords: true, supportTickets: true } },
        kycRecords: { select: { rawProviderLogId: true } }
      }
    });
    if (!user || user.role !== UserRole.USER) {
      throw new ApiException("User not found", "USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    if (dto.confirmation !== `DELETE ${user.phoneNumber}`) {
      throw new ApiException(
        `Type DELETE ${user.phoneNumber} to confirm permanent deletion`,
        "USER_DELETE_CONFIRMATION_INVALID",
        HttpStatus.BAD_REQUEST
      );
    }

    const providerLogIds = user.kycRecords
      .map((record) => record.rawProviderLogId)
      .filter((id): id is string => Boolean(id));
    await this.prisma.$transaction(async (tx) => {
      await tx.securityAudit.deleteMany({ where: { userId } });
      await tx.auditLog.deleteMany({
        where: { OR: [{ actorId: userId }, { entityType: "User", entityId: userId }] }
      });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorType: "admin",
          action: "ADMIN_USER_PERMANENTLY_DELETED",
          entityType: "User",
          entityId: userId,
          metadata: {
            reason: dto.reason,
            hardDelete: true,
            deletedCounts: user._count
          }
        }
      });
      await tx.cashDropProfile.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
      if (providerLogIds.length) {
        await tx.providerLog.deleteMany({ where: { id: { in: providerLogIds } } });
      }
    });
    return { deleted: true, permanent: true, userId };
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
