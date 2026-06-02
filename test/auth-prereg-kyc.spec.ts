import { KycStatus, WalletStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { AuthService } from "../src/auth/auth.service";

jest.mock("bcryptjs", () => ({
  hash: jest.fn(async (value: string) => `hashed:${value}`),
  compare: jest.fn()
}));

describe("pre-registration KYC onboarding", () => {
  const registrationToken = "reg_temp_123";
  const registrationKey = `registration:${registrationToken}`;

  function makeService() {
    const session = {
      phoneNumber: "+2347057109319",
      requiresOtp: true,
      createdAt: "2026-06-02T00:00:00.000Z"
    };
    const redisStore = new Map<string, unknown>([[registrationKey, session]]);
    const txClient = {
      kycRecord: { create: jest.fn().mockResolvedValue({ id: "kyc_db_1" }) },
      profile: { upsert: jest.fn().mockResolvedValue({}) },
      user: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    const prisma = {
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === "function") return (arg as (client: typeof txClient) => Promise<unknown>)(txClient);
        return Promise.all(arg as Promise<unknown>[]);
      }),
      kycRecord: txClient.kycRecord,
      profile: txClient.profile,
      user: txClient.user,
      authSession: {
        create: jest.fn().mockResolvedValue({ id: "session_1" }),
        update: jest.fn().mockResolvedValue({})
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    const usersRepository = {
      findByPhoneNumber: jest.fn().mockResolvedValue(null),
      createUser: jest.fn().mockResolvedValue({
        id: "user_1",
        phoneNumber: session.phoneNumber,
        walletStatus: WalletStatus.inactive,
        kycRecords: []
      }),
      findById: jest.fn().mockResolvedValue({
        id: "user_1",
        phoneNumber: session.phoneNumber,
        walletStatus: WalletStatus.active,
        kycRecords: [{ status: KycStatus.verified }]
      })
    };
    const usersService = {
      toContractUser: jest.fn((user) => ({ id: user.id, kycStatus: user.kycRecords?.[0]?.status ?? "not_started" }))
    };
    const redis = {
      getJson: jest.fn(async (key: string) => redisStore.get(key) ?? null),
      setJson: jest.fn(async (key: string, value: unknown) => {
        redisStore.set(key, value);
      }),
      del: jest.fn(async (key: string) => {
        redisStore.delete(key);
      })
    };
    const jwt = {
      signAsync: jest.fn(async (payload: { typ: string }) => `${payload.typ}_token`)
    };
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          REGISTRATION_TTL_SECONDS: "900",
          JWT_ACCESS_SECRET: "access_secret",
          JWT_REFRESH_SECRET: "refresh_secret",
          JWT_ACCESS_TTL: "15m",
          JWT_REFRESH_TTL_DAYS: "30"
        };
        return values[key] ?? fallback;
      })
    };
    const kycProvider = {
      verifyBvn: jest.fn().mockResolvedValue({
        bvnVerified: true,
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        dateOfBirth: "1990-01-01",
        country: "NG"
      }),
      validateSelfie: jest.fn().mockResolvedValue({
        faceMatch: true,
        confidenceScore: 98.5,
        profileImageUrl: "https://provider.example/selfie.jpg"
      })
    };
    const cloudinary = {
      uploadBase64Image: jest.fn().mockResolvedValue({
        secureUrl: "https://res.cloudinary.com/tf/selfie.jpg",
        uploadId: "tf/users/kyc-selfies/kyc_ref_1"
      })
    };
    const wallet = {
      activateWallet: jest.fn().mockResolvedValue(undefined),
      createDva: jest.fn().mockResolvedValue({ accountNumber: "1234567890" })
    };
    const cashDrop = {
      register: jest.fn().mockResolvedValue({ CashDropId: "cashdrop_1" })
    };

    const service = new AuthService(
      prisma as never,
      usersRepository as never,
      usersService as never,
      redis as never,
      jwt as never,
      config as never,
      kycProvider as never,
      cloudinary as never,
      wallet as never,
      cashDrop as never
    );
    return { service, redis, redisStore, usersRepository, prisma, txClient, kycProvider, cloudinary, wallet, cashDrop };
  }

  it("verifies BVN against a registration token and stores temporary KYC state", async () => {
    const { service, redis, redisStore, kycProvider } = makeService();

    await expect(service.verifyRegistrationBvn(registrationToken, "12345678901")).resolves.toMatchObject({
      kycReference: expect.stringMatching(/^kyc_ref_/),
      bvnVerified: true,
      firstName: "Ada"
    });

    expect(kycProvider.verifyBvn).toHaveBeenCalledWith("12345678901");
    expect(redis.setJson).toHaveBeenCalledWith(
      registrationKey,
      expect.objectContaining({
        kyc: expect.objectContaining({
          bvnHash: expect.any(String),
          bvnVerified: true,
          status: KycStatus.bvn_verified
        })
      }),
      900
    );
    expect((redisStore.get(registrationKey) as { kyc: { userId?: string } }).kyc.userId).toBeUndefined();
  });

  it("validates selfie for a pre-registration KYC reference and keeps the secure Cloudinary URL", async () => {
    const { service, redisStore, cloudinary, kycProvider } = makeService();
    const bvn = await service.verifyRegistrationBvn(registrationToken, "12345678901");
    const selfie = "data:image/jpeg;base64,aGVsbG8=";

    await expect(service.validateRegistrationSelfie(registrationToken, bvn.kycReference, selfie)).resolves.toMatchObject({
      kycStatus: "verified",
      faceMatch: true,
      profileImageUrl: "https://res.cloudinary.com/tf/selfie.jpg"
    });

    expect(cloudinary.uploadBase64Image).toHaveBeenCalledWith(selfie, "tf/users/kyc-selfies", `${bvn.kycReference}.jpg`);
    expect(kycProvider.validateSelfie).toHaveBeenCalledWith(bvn.kycReference, "aGVsbG8=");
    expect((redisStore.get(registrationKey) as { kyc: { selfieImageUrl: string } }).kyc.selfieImageUrl).toBe(
      "https://res.cloudinary.com/tf/selfie.jpg"
    );
  });

  it("creates the user and attaches verified pre-registration KYC on registration complete", async () => {
    const { service, usersRepository, txClient, wallet, cashDrop, redis } = makeService();
    const bvn = await service.verifyRegistrationBvn(registrationToken, "12345678901");
    const selfie = "data:image/jpeg;base64,aGVsbG8=";
    await service.validateRegistrationSelfie(registrationToken, bvn.kycReference, selfie);

    await expect(
      service.completeRegistration({ registrationToken, passcode: "123456" }, { ipAddress: "127.0.0.1" })
    ).resolves.toMatchObject({
      accessToken: "access_token",
      refreshToken: "refresh_token",
      user: { id: "user_1" }
    });

    expect(usersRepository.createUser).toHaveBeenCalledWith("+2347057109319", "hashed:123456");
    expect(txClient.kycRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          kycReference: bvn.kycReference,
          bvnVerified: true,
          selfieVerified: true,
          status: KycStatus.verified
        })
      })
    );
    expect(txClient.profile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1" },
        update: expect.objectContaining({ profileImageUrl: "https://res.cloudinary.com/tf/selfie.jpg" })
      })
    );
    expect(wallet.activateWallet).toHaveBeenCalledWith("user_1");
    expect(wallet.createDva).toHaveBeenCalledWith("user_1", "auto");
    expect(cashDrop.register).toHaveBeenCalledWith("user_1");
    expect(redis.del).toHaveBeenCalledWith(registrationKey);
  });
});
