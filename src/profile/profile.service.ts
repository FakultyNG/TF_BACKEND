import { HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        kycRecords: { orderBy: { createdAt: "desc" }, take: 1 },
        trustedDevices: { where: { enabled: true }, take: 1 }
      }
    });
    if (!user) throw new ApiException("User not found", "USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    return this.toProfileResponse(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { kycRecords: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    if (!user) throw new ApiException("User not found", "USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    const profile = await this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        profileImageUrl: dto.profileImageUrl
      },
      update: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        profileImageUrl: dto.profileImageUrl
      }
    });
    return {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phoneNumber: user.phoneNumber,
      dateOfBirth: this.formatDate(profile.dateOfBirth),
      gender: profile.gender,
      profileImageUrl: profile.profileImageUrl,
      kycStatus: user.kycRecords[0]?.status ?? "not_started"
    };
  }

  async adminUpdateOperationalFields(adminId: string, userId: string, data: { walletStatus?: "active" | "inactive"; supportNotes?: string; riskNotes?: string }) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        walletStatus: data.walletStatus,
        supportNotes: data.supportNotes,
        riskNotes: data.riskNotes
      },
      include: { profile: true, kycRecords: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: "admin",
        action: "ADMIN_USER_PROFILE_OPERATIONAL_UPDATED",
        entityType: "User",
        entityId: userId,
        metadata: data
      }
    });
    return this.toProfileResponse(updated);
  }

  private toProfileResponse(user: {
    id: string;
    phoneNumber: string;
    walletStatus: string;
    supportNotes?: string | null;
    riskNotes?: string | null;
    profile: { firstName: string | null; lastName: string | null; email: string | null; dateOfBirth: Date | null; gender?: string | null; profileImageUrl: string | null } | null;
    kycRecords: Array<{ status: string }>;
    trustedDevices?: Array<{ enabled: boolean }>;
  }) {
    return {
      id: user.id,
      firstName: user.profile?.firstName ?? null,
      lastName: user.profile?.lastName ?? null,
      email: user.profile?.email ?? null,
      phoneNumber: user.phoneNumber,
      dateOfBirth: this.formatDate(user.profile?.dateOfBirth ?? null),
      gender: user.profile?.gender ?? null,
      profileImageUrl: user.profile?.profileImageUrl ?? null,
      kycStatus: user.kycRecords[0]?.status ?? "not_started",
      walletStatus: user.walletStatus,
      biometricStatus: user.trustedDevices?.some((device) => device.enabled) ?? false,
      supportNotes: user.supportNotes,
      riskNotes: user.riskNotes
    };
  }

  private formatDate(value: Date | null) {
    return value ? value.toISOString().slice(0, 10) : null;
  }
}
