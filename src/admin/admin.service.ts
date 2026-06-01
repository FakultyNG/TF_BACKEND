import { Injectable } from "@nestjs/common";
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
