import { TransfersService } from "../src/transfers/transfers.service";

describe("Resolved account Transfa recipient metadata", () => {
  const resolved = {
    accountName: "ADA OKAFOR",
    accountNumber: "0123456789",
    bankCode: "044",
    bankName: "Access Bank",
    providerReference: "name-enquiry-1"
  };

  function service(candidates: unknown[]) {
    const ngnProvider = { resolveAccount: jest.fn().mockResolvedValue(resolved) };
    const prisma = {
      dedicatedVirtualAccount: { findMany: jest.fn().mockResolvedValue(candidates) }
    };
    return {
      ngnProvider,
      prisma,
      instance: new TransfersService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        ngnProvider as never,
        {} as never,
        undefined,
        prisma as never
      )
    };
  }

  it("returns the active CashDrop image for an exact account and bank match", async () => {
    const { instance, prisma } = service([
      {
        userId: "recipient-1",
        accountNumber: "0123456789",
        accountName: "ADA OKAFOR",
        bankName: "Access Bank Nigeria Plc",
        user: {
          status: "active",
          cashDropProfile: { status: "active", profileImageUrl: "cashdrop.jpg" }
        }
      }
    ]);

    await expect(instance.resolveAccount("044", "0123456789", "sender-1")).resolves.toEqual({
      ...resolved,
      transfaUserMatched: true,
      transfaUserId: "recipient-1",
      profileImageUrl: "cashdrop.jpg"
    });
    expect(prisma.dedicatedVirtualAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: { not: "sender-1" } }) })
    );
  });

  it("does not expose a general profile image or use a partial-name match", async () => {
    const { instance } = service([
      {
        userId: "recipient-2",
        accountNumber: "9999999999",
        accountName: "ADA OKAFOR LIMITED",
        bankName: "Access Bank",
        user: { status: "active", cashDropProfile: null }
      }
    ]);

    await expect(instance.resolveAccount("044", "0123456789", "sender-1")).resolves.toEqual({
      ...resolved,
      transfaUserMatched: false,
      transfaUserId: null,
      profileImageUrl: null
    });
  });
});
