import { Injectable } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByPhoneNumber(phoneNumber: string) {
    return this.prisma.user.findUnique({
      where: { phoneNumber },
      include: { profile: true, kycRecords: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true, kycRecords: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
  }

  createUser(phoneNumber: string, passcodeHash: string) {
    return this.prisma.user.create({
      data: { phoneNumber, passcodeHash },
      include: { profile: true, kycRecords: true }
    });
  }

  updatePasscode(userId: string, passcodeHash: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { passcodeHash } });
  }

  listUsers(params: { take: number; skip: number; role?: UserRole }) {
    return this.prisma.user.findMany({
      take: params.take,
      skip: params.skip,
      where: params.role ? { role: params.role } : undefined,
      select: {
        id: true,
        phoneNumber: true,
        role: true,
        status: true,
        walletStatus: true,
        createdAt: true,
        profile: true,
        kycRecords: { orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  updateProfile(userId: string, data: Prisma.ProfileUncheckedCreateInput) {
    return this.prisma.profile.upsert({
      where: { userId },
      create: { ...data, userId },
      update: data
    });
  }
}
