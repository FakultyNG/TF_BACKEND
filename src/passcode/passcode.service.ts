import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { ApiException } from "../common/errors/api.exception";
import { normalizePhoneNumber } from "../common/utils/phone.util";
import { OtpService } from "../otp/otp.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { UsersRepository } from "../users/users.repository";

interface ResetSession {
  phoneNumber: string;
  userId: string;
}

@Injectable()
export class PasscodeService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly otpService: OtpService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async change(userId: string, oldPasscode: string, newPasscode: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user || !(await bcrypt.compare(oldPasscode, user.passcodeHash))) {
      throw new ApiException("Invalid passcode", "INVALID_PASSCODE", HttpStatus.UNAUTHORIZED);
    }
    await this.usersRepository.updatePasscode(userId, await bcrypt.hash(newPasscode, 12));
    await this.prisma.auditLog.create({
      data: { actorId: userId, actorType: "user", action: "PASSCODE_CHANGED", entityType: "User", entityId: userId }
    });
    return { changed: true };
  }

  async requestReset(phoneNumber: string) {
    const normalized = normalizePhoneNumber(phoneNumber);
    const user = await this.usersRepository.findByPhoneNumber(normalized);
    if (!user) throw new ApiException("User not found", "USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    const otp = await this.otpService.sendOtp(normalized, "passcode_reset");
    return { otpReference: otp.otpReference };
  }

  async verifyReset(phoneNumber: string, otp: string, otpReference: string) {
    const validation = await this.otpService.validateOtp(phoneNumber, otp, otpReference);
    await this.otpService.consumeValidatedOtp(otpReference, phoneNumber, "passcode_reset");
    const user = await this.usersRepository.findByPhoneNumber(validation.phoneNumber);
    if (!user) throw new ApiException("User not found", "USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    const resetToken = `reset_temp_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const session: ResetSession = { phoneNumber: validation.phoneNumber, userId: user.id };
    await this.redis.setJson(
      `passcode-reset:${resetToken}`,
      session,
      Number(this.config.get<string>("PASSCODE_RESET_TTL_SECONDS", "600"))
    );
    return { resetToken };
  }

  async completeReset(resetToken: string, newPasscode: string) {
    const key = `passcode-reset:${resetToken}`;
    const session = await this.redis.getJson<ResetSession>(key);
    if (!session) throw new ApiException("Passcode reset token expired", "PASSCODE_RESET_EXPIRED", HttpStatus.BAD_REQUEST);
    await this.usersRepository.updatePasscode(session.userId, await bcrypt.hash(newPasscode, 12));
    await this.redis.del(key);
    await this.prisma.authSession.updateMany({
      where: { userId: session.userId, status: "active" },
      data: { status: "revoked", revokedAt: new Date() }
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: session.userId,
        actorType: "user",
        action: "PASSCODE_RESET_COMPLETED",
        entityType: "User",
        entityId: session.userId
      }
    });
    return { reset: true };
  }
}
