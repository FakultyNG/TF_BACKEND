import { CashDropProfileStatus, DvaStatus, KycStatus, WalletStatus } from "@prisma/client";
import { CashDropService } from "../src/cash-drop/cash-drop.service";

describe("CashDropService", () => {
  const createService = (overrides: {
    user?: unknown;
    profile?: unknown;
    profiles?: unknown[];
    confidence?: number;
    resolveAttempts?: number;
  }) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(overrides.user)
      },
      cashDropProfile: {
        upsert: jest.fn().mockResolvedValue({
          id: "cashdrop_1",
          userId: "user_1",
          status: CashDropProfileStatus.active
        }),
        findUnique: jest.fn().mockResolvedValue(overrides.profile),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue(overrides.profiles ?? [])
      },
      auditLog: { create: jest.fn() }
    };
    const fingerprint = {
      fingerprintFromImageUrl: jest.fn().mockResolvedValue({ fingerprint: "11110000", fingerprintHash: "hash_1" }),
      fingerprintFromBase64: jest.fn().mockResolvedValue({ fingerprint: "11110000", fingerprintHash: "hash_1" }),
      compare: jest.fn().mockReturnValue(overrides.confidence ?? 100)
    };
    const redis = {
      incrementWithTtl: jest.fn().mockResolvedValue(overrides.resolveAttempts ?? 1)
    };
    const config = { get: jest.fn((_key: string, fallback: string) => fallback) };
    return { service: new CashDropService(prisma as never, fingerprint as never, redis as never, config as never), prisma, fingerprint };
  };

  const eligibleUser = {
    id: "user_1",
    walletStatus: WalletStatus.active,
    profile: { firstName: "John", lastName: "Musa", profileImageUrl: "data:image/png;base64,test" },
    kycRecords: [{ status: KycStatus.verified }],
    dedicatedVirtualAccounts: [{
      id: "dva_1",
      status: DvaStatus.active,
      bankName: "Wema Bank",
      accountNumber: "1234567890",
      accountName: "TransFa JOHN MUSA"
    }]
  };

  it("requires verified KYC, active wallet, profile image, and active DVA before registration", async () => {
    const { service } = createService({
      user: { ...eligibleUser, kycRecords: [{ status: KycStatus.pending }] }
    });

    await expect(service.register("user_1")).rejects.toMatchObject({ code: "CASH_DROP_REGISTRATION_FAILED" });
  });

  it("registers an eligible user's profile fingerprint", async () => {
    const { service, prisma } = createService({ user: eligibleUser });

    await expect(service.register("user_1")).resolves.toMatchObject({
      CashDropId: "cashdrop_1",
      userId: "user_1",
      status: CashDropProfileStatus.active,
      linkedToDva: true
    });
    expect(prisma.cashDropProfile.upsert).toHaveBeenCalled();
  });

  it("resolves a confident image match to receiver payment details", async () => {
    const { service } = createService({
      profiles: [{
        id: "cashdrop_1",
        userId: "receiver_1",
        fingerprint: "11110000",
        status: CashDropProfileStatus.active,
        profileImageUrl: "https://cdn.test/profile.png",
        user: { profile: { firstName: "John", lastName: "Musa" } },
        dva: { bankName: "Wema Bank", accountNumber: "1234567890", accountName: "TransFa JOHN MUSA" }
      }],
      confidence: 96.4
    });

    await expect(service.resolve("scanner_1", "data:image/png;base64,test")).resolves.toMatchObject({
      receiverId: "receiver_1",
      displayName: "John Musa",
      bankName: "Wema Bank",
      matchConfidence: 96.4
    });
  });

  it("fails safely when match confidence is too low", async () => {
    const { service } = createService({
      profiles: [{
        id: "cashdrop_1",
        userId: "receiver_1",
        fingerprint: "00000000",
        status: CashDropProfileStatus.active,
        user: { profile: { firstName: "John", lastName: "Musa" } },
        dva: { bankName: "Wema Bank", accountNumber: "1234567890", accountName: "TransFa JOHN MUSA" }
      }],
      confidence: 60
    });

    await expect(service.resolve("scanner_1", "data:image/png;base64,test")).rejects.toMatchObject({ code: "CASH_DROP_NO_SAFE_MATCH" });
  });

  it("does not resolve disabled CashDrop profiles", async () => {
    const { service } = createService({
      profiles: [{
        id: "cashdrop_1",
        userId: "receiver_1",
        fingerprint: "11110000",
        status: CashDropProfileStatus.disabled,
        user: { profile: { firstName: "John", lastName: "Musa" } },
        dva: { bankName: "Wema Bank", accountNumber: "1234567890", accountName: "TransFa JOHN MUSA" }
      }],
      confidence: 100
    });

    await expect(service.resolve("scanner_1", "data:image/png;base64,test")).rejects.toMatchObject({ code: "CASH_DROP_NO_SAFE_MATCH" });
  });

  it("fails safely when multiple active profiles are ambiguous high-confidence matches", async () => {
    const { service } = createService({
      profiles: [
        {
          id: "cashdrop_1",
          userId: "receiver_1",
          fingerprint: "11110000",
          status: CashDropProfileStatus.active,
          user: { profile: { firstName: "John", lastName: "Musa" } },
          dva: { bankName: "Wema Bank", accountNumber: "1234567890", accountName: "TransFa JOHN MUSA" }
        },
        {
          id: "cashdrop_2",
          userId: "receiver_2",
          fingerprint: "11110000",
          status: CashDropProfileStatus.active,
          user: { profile: { firstName: "Ada", lastName: "Musa" } },
          dva: { bankName: "Wema Bank", accountNumber: "9234567890", accountName: "TransFa ADA MUSA" }
        }
      ],
      confidence: 100
    });

    await expect(service.resolve("scanner_1", "data:image/png;base64,test")).rejects.toMatchObject({ code: "CASH_DROP_NO_SAFE_MATCH" });
  });
});
