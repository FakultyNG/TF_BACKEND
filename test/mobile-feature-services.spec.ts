import { BiometricMethod, SupportMessageSenderType, SupportTicketStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { BiometricsService } from "../src/biometrics/biometrics.service";
import { NotificationsService } from "../src/notifications/notifications.service";
import { SupportService } from "../src/support/support.service";
import { TransactionsService } from "../src/transactions/transactions.service";

describe("next mobile feature services", () => {
  it("creates a support ticket with the first user message", async () => {
    const tx = {
      supportTicket: {
        create: jest.fn().mockResolvedValue({ id: "ticket_1", status: SupportTicketStatus.open, createdAt: new Date("2026-05-31T00:00:00Z") })
      },
      supportMessage: { create: jest.fn().mockResolvedValue({ id: "msg_1" }) },
      supportAttachment: { findMany: jest.fn(), updateMany: jest.fn() }
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
      transaction: { findFirst: jest.fn() },
      supportTicket: tx.supportTicket
    };
    const service = new SupportService(prisma as never, {} as never, {} as never);

    await expect(service.createTicket("user_1", { subject: "Help", message: "Need help" })).resolves.toMatchObject({
      ticketId: "ticket_1",
      status: SupportTicketStatus.open
    });
    expect(tx.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1"
        })
      })
    );
    expect(tx.supportMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ senderType: SupportMessageSenderType.user, message: "Need help" })
    }));
  });

  it("blocks user reply to a closed support ticket", async () => {
    const service = new SupportService({
      supportTicket: { findFirst: jest.fn().mockResolvedValue({ id: "ticket_1", status: SupportTicketStatus.closed }) }
    } as never, {} as never, {} as never);

    await expect(service.replyUser("user_1", "ticket_1", { message: "hello" })).rejects.toMatchObject({
      code: "SUPPORT_TICKET_CLOSED"
    });
  });

  it("fetches transaction history using only the authenticated user's transactions", async () => {
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([
        [{ id: "txn_1", type: TransactionType.wallet_funding, amount: 1000, currency: "NGN", status: TransactionStatus.successful, description: "Wallet funding", createdAt: new Date() }],
        1
      ]),
      transaction: {
        findMany: jest.fn((args) => args),
        count: jest.fn((args) => args)
      }
    };
    const service = new TransactionsService(prisma as never);

    const result = await service.listUserTransactions("user_1", { page: 1, limit: 20 });

    expect(result.pagination.total).toBe(1);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "user_1" }) }));
  });

  it("hides internal failure reasons from customer transaction history", async () => {
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([
        [
          {
            id: "txn_reversal",
            type: TransactionType.reversal,
            amount: 1000,
            fee: 0,
            totalDebit: 1000,
            currency: "NGN",
            status: TransactionStatus.successful,
            reference: "rev_1",
            description: "Provider failed before NGN transfer submission",
            narration: "Reversal of txn_ngn_private_reference",
            metadata: { reason: "Request failed with status code 403" },
            createdAt: new Date()
          },
          {
            id: "txn_failed",
            type: TransactionType.ngn_transfer,
            amount: 1000,
            fee: 10,
            totalDebit: 1010,
            currency: "NGN",
            status: TransactionStatus.failed,
            reference: "txn_1",
            description: "Strowallet request failed with status code 403",
            narration: "Lunch",
            metadata: {},
            createdAt: new Date()
          }
        ],
        2
      ]),
      transaction: { findMany: jest.fn(), count: jest.fn() }
    };
    const service = new TransactionsService(prisma as never);

    const result = await service.listUserTransactions("user_1", { page: 1, limit: 20 });

    expect(result.items[0]).toMatchObject({
      description: "Transaction reversal",
      narration: null
    });
    expect(result.items[1]).toMatchObject({ description: "Bank transfer", narration: "Lunch" });
    expect(JSON.stringify(result.items)).not.toContain("Provider failed");
    expect(JSON.stringify(result.items)).not.toContain("status code 403");
  });

  it("rejects fetching another user's transaction", async () => {
    const service = new TransactionsService({
      transaction: { findFirst: jest.fn().mockResolvedValue(null) }
    } as never);

    await expect(service.getUserTransaction("user_1", "txn_other")).rejects.toMatchObject({ code: "TRANSACTION_NOT_FOUND" });
  });

  it("issues biometric login tokens only for an enabled trusted device", async () => {
    const prisma = {
      trustedDevice: {
        findUnique: jest.fn().mockResolvedValue({ id: "dev_1", userId: "user_1", enabled: true, user: {} }),
        update: jest.fn()
      },
      securityAudit: { create: jest.fn() }
    };
    const auth = { issueMobileTokens: jest.fn().mockResolvedValue({ accessToken: "access", refreshToken: "refresh" }) };
    const redis = { incrementWithTtl: jest.fn().mockResolvedValue(1), del: jest.fn() };
    const service = new BiometricsService(prisma as never, auth as never, redis as never);

    await expect(service.login("device_1", {})).resolves.toMatchObject({ accessToken: "access", refreshToken: "refresh" });
    expect(auth.issueMobileTokens).toHaveBeenCalledWith("user_1", {});
  });

  it("marks visible notifications as read for the authenticated user", async () => {
    const prisma = {
      notification: { findFirst: jest.fn().mockResolvedValue({ id: "notif_1" }) },
      notificationReceipt: { upsert: jest.fn().mockResolvedValue({}) }
    };
    const service = new NotificationsService(prisma as never, {} as never);

    await expect(service.markRead("user_1", "notif_1")).resolves.toEqual({ notificationId: "notif_1", isRead: true });
    expect(prisma.notificationReceipt.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { notificationId_userId: { notificationId: "notif_1", userId: "user_1" } }
    }));
  });
});
