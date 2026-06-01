import { Inject, Injectable, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomInt } from "crypto";
import { v4 as uuid } from "uuid";
import { ApiException } from "../common/errors/api.exception";
import { normalizePhoneNumber } from "../common/utils/phone.util";
import { OTP_PROVIDER } from "../providers/provider.tokens";
import { OtpProvider } from "../providers/interfaces/otp-provider.interface";
import { RedisService } from "../redis/redis.service";
import { OtpSession } from "./otp.types";

@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider
  ) {}

  async sendOtp(phoneNumber: string, purpose: OtpSession["purpose"] = "phone_verification") {
    const normalized = normalizePhoneNumber(phoneNumber);
    const rateKey = `otp-rate:${normalized}:${purpose}`;
    const count = await this.redis.incrementWithTtl(rateKey, 60);
    if (count > 3) {
      throw new ApiException("Too many OTP requests", "OTP_RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.createOtpSession(normalized, purpose);
  }

  async resendOtp(phoneNumber: string, otpReference: string) {
    const existing = await this.redis.getJson<OtpSession>(`otp:${otpReference}`);
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!existing || existing.phoneNumber !== normalized) {
      throw new ApiException("OTP session not found", "OTP_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    await this.redis.del(`otp:${otpReference}`);
    return this.createOtpSession(normalized, existing.purpose);
  }

  async validateOtp(phoneNumber: string, otp: string, otpReference: string) {
    const key = `otp:${otpReference}`;
    const session = await this.redis.getJson<OtpSession>(key);
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!session || session.phoneNumber !== normalized) {
      throw new ApiException("OTP session not found", "OTP_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    const maxAttempts = Number(this.config.get<string>("OTP_MAX_ATTEMPTS", "5"));
    if (session.attempts >= maxAttempts) {
      await this.redis.del(key);
      throw new ApiException("OTP attempts exceeded", "OTP_ATTEMPTS_EXCEEDED", HttpStatus.BAD_REQUEST);
    }
    if (session.otp !== otp) {
      session.attempts += 1;
      await this.redis.setJson(key, session, Number(this.config.get<string>("OTP_TTL_SECONDS", "300")));
      throw new ApiException("Invalid OTP", "INVALID_OTP", HttpStatus.BAD_REQUEST);
    }
    session.validated = true;
    await this.redis.setJson(key, session, Number(this.config.get<string>("OTP_TTL_SECONDS", "300")));
    return { phoneVerified: true, phoneNumber: normalized, purpose: session.purpose };
  }

  async consumeValidatedOtp(otpReference: string, phoneNumber: string, purpose: OtpSession["purpose"]) {
    const key = `otp:${otpReference}`;
    const session = await this.redis.getJson<OtpSession>(key);
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!session || session.phoneNumber !== normalized || session.purpose !== purpose || !session.validated) {
      throw new ApiException("OTP has not been verified", "OTP_NOT_VERIFIED", HttpStatus.BAD_REQUEST);
    }
    await this.redis.del(key);
  }

  private async createOtpSession(phoneNumber: string, purpose: OtpSession["purpose"]) {
    const otpReference = `otp_ref_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const otp = this.config.get<string>("MOCK_OTP_CODE") || String(randomInt(0, 1000000)).padStart(6, "0");
    const session: OtpSession = { phoneNumber, otp, attempts: 0, purpose };
    await this.redis.setJson(`otp:${otpReference}`, session, Number(this.config.get<string>("OTP_TTL_SECONDS", "300")));
    await this.otpProvider.sendOtp({ phoneNumber, otp, purpose });
    return { phoneNumber, otpReference };
  }
}
