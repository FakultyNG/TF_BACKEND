import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuid } from "uuid";
import { ApiException } from "../common/errors/api.exception";
import { normalizePhoneNumber } from "../common/utils/phone.util";
import { OtpProvider, OtpPurpose } from "../providers/interfaces/otp-provider.interface";
import { OTP_PROVIDER } from "../providers/provider.tokens";
import { RedisService } from "../redis/redis.service";
import { OtpSession } from "./otp.types";

@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider
  ) {}

  async sendOtp(phoneNumber: string, purpose: OtpPurpose = "registration") {
    const normalized = normalizePhoneNumber(phoneNumber);
    const rateKey = `otp-rate:${normalized}:${purpose}`;
    const count = await this.redis.incrementWithTtl(rateKey, this.getOtpTtlSeconds());
    if (count > 2) {
      throw new ApiException("Too many OTP requests", "OTP_TOO_MANY_ATTEMPTS", HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.createOtpSession(normalized, purpose);
  }

  async resendOtp(phoneNumber: string, otpReference: string) {
    const existing = await this.redis.getJson<OtpSession>(`otp:${otpReference}`);
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!existing || existing.phoneNumber !== normalized) {
      throw new ApiException("OTP expired", "OTP_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    await this.redis.del(`otp:${otpReference}`);
    return this.createOtpSession(normalized, existing.purpose);
  }

  async validateOtp(phoneNumber: string, otp: string, otpReference: string) {
    const key = `otp:${otpReference}`;
    const session = await this.redis.getJson<OtpSession>(key);
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!session || session.phoneNumber !== normalized) {
      throw new ApiException("OTP expired", "OTP_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    const ttl = this.getRemainingTtlSeconds(session);
    if (ttl <= 0) {
      await this.redis.del(key);
      throw new ApiException("OTP expired", "OTP_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    if (session.verified) {
      return { phoneVerified: true, phoneNumber: normalized, purpose: session.purpose };
    }
    const maxAttempts = Number(this.config.get<string>("OTP_MAX_ATTEMPTS", "3"));
    if (session.attempts >= maxAttempts) {
      await this.redis.del(key);
      throw new ApiException("OTP attempts exceeded", "OTP_TOO_MANY_ATTEMPTS", HttpStatus.TOO_MANY_REQUESTS);
    }
    const confirmation = await this.otpProvider.confirmOtp({
      otpReference,
      phoneNumber: normalized,
      purpose: session.purpose,
      providerReference: session.providerReference,
      otp,
      expectedOtp: session.otp
    });
    if (!confirmation.verified) {
      session.attempts += 1;
      await this.redis.setJson(key, session, ttl);
      throw new ApiException("Invalid OTP", "OTP_INVALID", HttpStatus.BAD_REQUEST);
    }
    session.validated = true;
    session.verified = true;
    await this.redis.setJson(key, session, ttl);
    return { phoneVerified: true, phoneNumber: normalized, purpose: session.purpose };
  }

  async consumeValidatedOtp(otpReference: string, phoneNumber: string, purpose: OtpPurpose) {
    const key = `otp:${otpReference}`;
    const session = await this.redis.getJson<OtpSession>(key);
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!session || session.phoneNumber !== normalized || session.purpose !== purpose || !session.verified) {
      throw new ApiException("OTP has not been verified", "OTP_NOT_VERIFIED", HttpStatus.BAD_REQUEST);
    }
    await this.redis.del(key);
  }

  private async createOtpSession(phoneNumber: string, purpose: OtpPurpose) {
    const otpReference = `otp_ref_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const ttl = this.getOtpTtlSeconds();
    const otp = this.isOtpDevMode() ? this.config.get<string>("MOCK_OTP_CODE", "123456") : undefined;
    const providerResult = await this.otpProvider.sendOtp({ otpReference, phoneNumber, purpose, otp });
    const session: OtpSession = {
      phoneNumber,
      otp,
      attempts: 0,
      purpose,
      provider: providerResult.provider,
      providerReference: providerResult.providerReference,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      verified: false
    };
    await this.redis.setJson(`otp:${otpReference}`, session, ttl);
    return { phoneNumber, otpReference };
  }

  private getOtpTtlSeconds(): number {
    const expirationMinutes = Number(this.config.get<string>("SENDCHAMP_OTP_EXPIRATION_MINUTES", ""));
    if (Number.isFinite(expirationMinutes) && expirationMinutes > 0) return expirationMinutes * 60;
    return Number(this.config.get<string>("OTP_TTL_SECONDS", "300"));
  }

  private getRemainingTtlSeconds(session: OtpSession): number {
    const expiresAt = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return this.getOtpTtlSeconds();
    return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  }

  private isOtpDevMode(): boolean {
    return ["1", "true", "yes", "on"].includes(String(this.config.get<string>("OTP_DEV_MODE", "false")).toLowerCase());
  }
}
