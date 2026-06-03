import { AuthSessionStatus, CashDropProfileStatus, DvaStatus, UserStatus, WalletStatus } from "@prisma/client";
import { AdminService } from "../src/admin/admin.service";

describe("admin user deletion", () => {
  function makeService(user: { id: string; status: UserStatus } | null = { id: "user_1", status: UserStatus.active }) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ id: "user_1", status: UserStatus.disabled })
      },
      authSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      userDeviceToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      trustedDevice: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      dedicatedVirtualAccount: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      cashDropProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations))
    };
    const service = new AdminService(prisma as never, {} as never);
    return { service, prisma };
  }

  it("soft-deletes a user and revokes active access surfaces", async () => {
    const { service, prisma } = makeService();

    await expect(service.deleteUser("admin_1", "user_1", "fraud")).resolves.toEqual({
      deleted: true,
      userId: "user_1",
      status: UserStatus.disabled
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { status: UserStatus.disabled, walletStatus: WalletStatus.inactive }
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", status: AuthSessionStatus.active },
      data: { status: AuthSessionStatus.revoked, revokedAt: expect.any(Date) }
    });
    expect(prisma.userDeviceToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", isActive: true },
      data: { isActive: false }
    });
    expect(prisma.trustedDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", enabled: true },
      data: { enabled: false, disabledAt: expect.any(Date) }
    });
    expect(prisma.dedicatedVirtualAccount.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", status: DvaStatus.active },
      data: { status: DvaStatus.inactive }
    });
    expect(prisma.cashDropProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", status: CashDropProfileStatus.active },
      data: { status: CashDropProfileStatus.disabled, disabledAt: expect.any(Date) }
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "admin_1",
        actorType: "admin",
        action: "ADMIN_USER_DELETED",
        entityType: "User",
        entityId: "user_1",
        metadata: { reason: "fraud", softDelete: true }
      })
    });
  });

  it("rejects deleting a missing user", async () => {
    const { service } = makeService(null);

    await expect(service.deleteUser("admin_1", "missing")).rejects.toMatchObject({
      code: "USER_NOT_FOUND"
    });
  });

  it("rejects an admin deleting their own account", async () => {
    const { service } = makeService({ id: "admin_1", status: UserStatus.active });

    await expect(service.deleteUser("admin_1", "admin_1")).rejects.toMatchObject({
      code: "ADMIN_CANNOT_DELETE_SELF"
    });
  });
});
