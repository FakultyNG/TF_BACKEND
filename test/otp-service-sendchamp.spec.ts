import { HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiException } from "../src/common/errors/api.exception";
import { normalizePhoneNumber } from "../src/common/utils/phone.util";
import { OtpService } from "../src/otp/otp.service";
import { OtpProvider } from "../src/providers/interfaces/otp-provider.interface";

describe("OtpService provider-backed sessions", () => {
  const makeService = (overrides?: {
    provider?: Partial<OtpProvider>;
    config?: Record<string, unknown>;
    redis?: Record<string, jest.Mock>;
  }) => {
    const store = new Map<string, { value: unknown; ttl: number }>();
    const redis = {
      incrementWithTtl: jest.fn().mockResolvedValue(1),
      setJson: jest.fn(async (key: string, value: unknown, ttl: number) => {
        store.set(key, { value, ttl });
      }),
      getJson: jest.fn(async (key: string) => store.get(key)?.value ?? null),
      del: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      ...overrides?.redis
    };
    const provider: OtpProvider = {
      sendOtp: jest.fn().mockResolvedValue({ provider: "sendchamp", providerReference: "sendchamp_ref_123" }),
      confirmOtp: jest.fn().mockResolvedValue({ provider: "sendchamp", verified: true }),
      ...overrides?.provider
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          OTP_MAX_ATTEMPTS: 3,
          SENDCHAMP_OTP_EXPIRATION_MINUTES: 10,
          MOCK_OTP_CODE: "123456",
          OTP_DEV_MODE: false,
          ...overrides?.config
        };
        return values[key] ?? fallback;
      })
    } as unknown as ConfigService;

    return {
      service: new OtpService(redis as any, config, provider),
      redis,
      provider,
      store
    };
  };

  it("stores provider metadata, expiry, and verification state after sending an OTP", async () => {
    const { service, provider, redis, store } = makeService();

    const result = await service.sendOtp("08103100000", "registration");

    expect(result.phoneNumber).toBe("2348103100000");
    expect(result.otpReference).toMatch(/^otp_ref_/);
    expect(redis.incrementWithTtl).toHaveBeenCalledWith("otp-rate:2348103100000:registration", 600);
    expect(provider.sendOtp).toHaveBeenCalledWith({
      otpReference: result.otpReference,
      phoneNumber: "2348103100000",
      purpose: "registration"
    });

    const session = store.get(`otp:${result.otpReference}`)?.value as any;
    expect(session).toMatchObject({
      phoneNumber: "2348103100000",
      purpose: "registration",
      attempts: 0,
      provider: "sendchamp",
      providerReference: "sendchamp_ref_123",
      verified: false
    });
    expect(session.otp).toBeUndefined();
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("validates through the configured provider and marks the session verified", async () => {
    const { service, provider, store } = makeService();
    const sent = await service.sendOtp("08103100000", "registration");

    const result = await service.validateOtp("08103100000", "123456", sent.otpReference);

    expect(provider.confirmOtp).toHaveBeenCalledWith({
      otpReference: sent.otpReference,
      phoneNumber: "2348103100000",
      purpose: "registration",
      providerReference: "sendchamp_ref_123",
      otp: "123456",
      expectedOtp: undefined
    });
    expect(result).toEqual({ phoneVerified: true, phoneNumber: "2348103100000", purpose: "registration" });
    expect((store.get(`otp:${sent.otpReference}`)?.value as any).verified).toBe(true);
  });

  it("rejects invalid provider confirmations and increments attempts", async () => {
    const { service, store } = makeService({
      provider: {
        confirmOtp: jest.fn().mockResolvedValue({ provider: "sendchamp", verified: false })
      }
    });
    const sent = await service.sendOtp("08103100000", "registration");

    await expect(service.validateOtp("08103100000", "000000", sent.otpReference)).rejects.toMatchObject({
      code: "OTP_INVALID"
    });
    expect((store.get(`otp:${sent.otpReference}`)?.value as any).attempts).toBe(1);
  });

  it("rejects validation after the maximum attempt count", async () => {
    const { service, store } = makeService({
      provider: {
        confirmOtp: jest.fn().mockResolvedValue({ provider: "sendchamp", verified: false })
      }
    });
    const sent = await service.sendOtp("08103100000", "registration");
    const session = store.get(`otp:${sent.otpReference}`)?.value as any;
    session.attempts = 3;

    await expect(service.validateOtp("08103100000", "000000", sent.otpReference)).rejects.toMatchObject({
      code: "OTP_TOO_MANY_ATTEMPTS",
      status: HttpStatus.TOO_MANY_REQUESTS
    });
  });

  it("uses fixed mock OTP only when OTP_DEV_MODE is enabled", async () => {
    const { service, store } = makeService({
      config: { OTP_DEV_MODE: true },
      provider: { sendOtp: jest.fn().mockResolvedValue({ provider: "mock", providerReference: "mock_ref" }) }
    });

    const sent = await service.sendOtp("08103100000", "registration");

    expect((store.get(`otp:${sent.otpReference}`)?.value as any).otp).toBe("123456");
  });

  it("normalizes Nigerian phone numbers and rejects invalid numbers", () => {
    expect(normalizePhoneNumber("07057109319")).toBe("2347057109319");
    expect(() => normalizePhoneNumber("12345")).toThrow(ApiException);
  });
});
