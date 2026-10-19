import { TransfersService } from "../src/transfers/transfers.service";

describe("Transfa contact matching", () => {
  it("returns only matched active users with live DVA and CashDrop payment details", async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "recipient-1",
            phoneNumber: "2348012345678",
            profile: { firstName: "Ada", lastName: "Okafor", profileImageUrl: "profile.jpg" },
            cashDropProfile: { profileImageUrl: "cashdrop.jpg" },
            dedicatedVirtualAccounts: [{
              accountNumber: "0123456789",
              accountName: "ADA OKAFOR",
              bankName: "Sterling Bank",
              metadata: null
            }]
          }
        ])
      }
    };
    const ngnProvider = { getBanks: jest.fn().mockResolvedValue([{ code: "232", name: "Sterling Bank Plc" }]) };
    const redis = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() };
    const service = new TransfersService(
      redis as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      ngnProvider as never,
      {} as never,
      undefined,
      prisma as never
    );

    await expect(service.matchContacts("signed-in-user", ["0801 234 5678", "not-a-phone"])).resolves.toEqual({
      items: [{
        userId: "recipient-1",
        phoneNumber: "2348012345678",
        displayName: "Ada Okafor",
        profileImageUrl: "cashdrop.jpg",
        accountNumber: "0123456789",
        accountName: "ADA OKAFOR",
        bankName: "Sterling Bank",
        bankCode: "232"
      }]
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { not: "signed-in-user" }, phoneNumber: { in: ["2348012345678"] }, status: "active" }
    }));
  });
});
