import { UserRole } from "@prisma/client";
import { AdminService } from "../src/admin/admin.service";

describe("admin permanent user deletion", () => {
  const user = {
    id: "user_1",
    role: UserRole.USER,
    phoneNumber: "2348012345678",
    _count: { transactions: 2, kycRecords: 1, supportTickets: 1 },
    kycRecords: [{ rawProviderLogId: "provider_log_1" }]
  };

  function makeService(existing: typeof user | null = user) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(existing),
        delete: jest.fn().mockResolvedValue({ id: "user_1" })
      },
      cashDropProfile: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      providerLog: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      securityAudit: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma))
    };
    return { service: new AdminService(prisma as never, {} as never), prisma };
  }

  it("hard-deletes a confirmed customer and linked provider logs", async () => {
    const { service, prisma } = makeService();

    await expect(service.deleteUser("admin_1", "user_1", {
      reason: "Customer requested erasure",
      confirmation: "DELETE 2348012345678"
    })).resolves.toEqual({ deleted: true, permanent: true, userId: "user_1" });

    expect(prisma.cashDropProfile.deleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    expect(prisma.securityAudit.deleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ actorId: "user_1" }, { entityType: "User", entityId: "user_1" }] }
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "user_1" } });
    expect(prisma.providerLog.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["provider_log_1"] } } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "admin_1",
        action: "ADMIN_USER_PERMANENTLY_DELETED",
        entityId: "user_1",
        metadata: expect.objectContaining({ hardDelete: true, reason: "Customer requested erasure" })
      })
    });
  });

  it("rejects an incorrect permanent-delete confirmation", async () => {
    const { service, prisma } = makeService();
    await expect(service.deleteUser("admin_1", "user_1", {
      reason: "Customer requested erasure",
      confirmation: "DELETE user_1"
    })).rejects.toMatchObject({ code: "USER_DELETE_CONFIRMATION_INVALID" });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("rejects deleting a missing user", async () => {
    const { service } = makeService(null);
    await expect(service.deleteUser("admin_1", "missing", {
      reason: "Requested erasure",
      confirmation: "DELETE 2348012345678"
    })).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
  });

  it("rejects an admin deleting their own account", async () => {
    const { service } = makeService();
    await expect(service.deleteUser("admin_1", "admin_1", {
      reason: "Requested erasure",
      confirmation: "DELETE 2348012345678"
    })).rejects.toMatchObject({ code: "ADMIN_CANNOT_DELETE_SELF" });
  });
});
