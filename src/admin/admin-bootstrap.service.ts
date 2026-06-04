import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { normalizePhoneNumber } from "../common/utils/phone.util";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async onApplicationBootstrap() {
    if (!this.isEnabled()) return;

    const rawPhoneNumber = this.config.get<string>("ADMIN_PHONE_NUMBER");
    const passcode = this.config.get<string>("ADMIN_PASSCODE");
    if (!rawPhoneNumber || !passcode) {
      throw new Error("ADMIN_PHONE_NUMBER and ADMIN_PASSCODE are required when ADMIN_BOOTSTRAP_ENABLED=true");
    }
    if (!/^\d{5}$/.test(passcode)) {
      throw new Error("ADMIN_PASSCODE must be exactly 5 digits");
    }

    const phoneNumber = normalizePhoneNumber(rawPhoneNumber);
    const passcodeHash = await bcrypt.hash(passcode, 12);
    const legacyUser = rawPhoneNumber !== phoneNumber ? await this.prisma.user.findUnique({ where: { phoneNumber: rawPhoneNumber } }) : null;
    const existingUser = await this.prisma.user.findUnique({ where: { phoneNumber } });

    const user = existingUser
      ? await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { role: UserRole.SUPER_ADMIN, status: "active", passcodeHash }
        })
      : legacyUser
        ? await this.prisma.user.update({
            where: { id: legacyUser.id },
            data: { phoneNumber, role: UserRole.SUPER_ADMIN, status: "active", passcodeHash }
          })
        : await this.prisma.user.create({
            data: {
              phoneNumber,
              passcodeHash,
              role: UserRole.SUPER_ADMIN,
              status: "active"
            }
          });

    await this.prisma.profile.upsert({
      where: { userId: user.id },
      update: { firstName: "Transfa", lastName: "Admin", country: "Nigeria" },
      create: { userId: user.id, firstName: "Transfa", lastName: "Admin", country: "Nigeria" }
    });

    this.logger.log(`Admin bootstrap ensured SUPER_ADMIN user ${phoneNumber}`);
  }

  private isEnabled() {
    return this.config.get<string>("ADMIN_BOOTSTRAP_ENABLED", "false").toLowerCase() === "true";
  }
}
