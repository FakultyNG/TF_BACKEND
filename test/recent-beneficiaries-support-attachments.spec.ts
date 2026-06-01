import { SupportTicketStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { RecentBeneficiariesService } from "../src/transfers/recent-beneficiaries.service";
import { TransfersService } from "../src/transfers/transfers.service";
import { SupportAttachmentStorageService } from "../src/support/support-attachment-storage.service";
import { SupportService } from "../src/support/support.service";

describe("recent beneficiaries and support attachments", () => {
  it("saves a recent beneficiary after NGN transfer confirmation", async () => {
    const quote = {
      userId: "user_1",
      bankCode: "044",
      bankName: "Access Bank",
      accountNumber: "1234567890",
      accountName: "Ada Musa",
      amount: 1000,
      fee: 100,
      totalDebit: 1100,
      currency: "NGN",
      expiresAt: new Date(Date.now() + 60000).toISOString()
    };
    const redis = { getJson: jest.fn().mockResolvedValue(quote), del: jest.fn() };
    const wallet = {
      getBalance: jest.fn().mockResolvedValue({ balance: 5000 }),
      debitWallet: jest.fn().mockResolvedValue({ transaction: { id: "txn_1" } }),
      updateTransactionProvider: jest.fn(),
      logProvider: jest.fn()
    };
    const auth = { verifyUserPasscode: jest.fn() };
    const recent = { saveOrUpdateNgnBeneficiary: jest.fn() };
    const ngnProvider = { submitTransfer: jest.fn().mockResolvedValue({ providerReference: "prov_1", status: TransactionStatus.processing, raw: {} }) };
    const service = new TransfersService(
      redis as never,
      wallet as never,
      auth as never,
      {} as never,
      {} as never,
      recent as never,
      ngnProvider as never,
      {} as never
    );

    await service.confirmNgn("user_1", "quote_1", "12345");

    expect(recent.saveOrUpdateNgnBeneficiary).toHaveBeenCalledWith("user_1", quote, "txn_1");
  });

  it("updates duplicate recent beneficiary lastUsedAt instead of creating a new row", async () => {
    const prisma = {
      recentBeneficiary: { upsert: jest.fn().mockResolvedValue({ id: "beneficiary_1" }) }
    };
    const service = new RecentBeneficiariesService(prisma as never);

    await service.saveOrUpdateNgnBeneficiary("user_1", {
      userId: "user_1",
      bankCode: "044",
      bankName: "Access Bank",
      accountNumber: "1234567890",
      accountName: "Ada Musa",
      amount: 1000,
      fee: 100,
      totalDebit: 1100,
      currency: "NGN",
      expiresAt: new Date().toISOString()
    });

    expect(prisma.recentBeneficiary.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ lastUsedAt: expect.any(Date) })
    }));
  });

  it("searches only the authenticated user's recent beneficiaries", async () => {
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([[{ id: "beneficiary_1", userId: "user_1" }], 1]),
      recentBeneficiary: {
        findMany: jest.fn((args) => args),
        count: jest.fn((args) => args)
      }
    };
    const service = new RecentBeneficiariesService(prisma as never);

    await service.search("user_1", { q: "Ada", page: 1, limit: 20 });

    expect(prisma.recentBeneficiary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user_1" })
    }));
  });

  it("deletes only the authenticated user's recent beneficiary", async () => {
    const prisma = {
      recentBeneficiary: {
        findFirst: jest.fn().mockResolvedValue({ id: "beneficiary_1", userId: "user_1" }),
        delete: jest.fn()
      }
    };
    const service = new RecentBeneficiariesService(prisma as never);

    await expect(service.delete("user_1", "beneficiary_1")).resolves.toEqual({ deleted: true, beneficiaryId: "beneficiary_1" });
    expect(prisma.recentBeneficiary.findFirst).toHaveBeenCalledWith({ where: { id: "beneficiary_1", userId: "user_1" } });
  });

  it("uploads valid support attachment metadata and rejects invalid files", async () => {
    const cloudinary = {
      uploadFile: jest.fn((file) =>
        Promise.resolve({ attachmentUrl: "https://res.cloudinary.com/mock/receipt.png", fileName: file.originalname, fileType: file.mimetype, fileSize: file.size })
      ),
      validateFile: jest.fn((file, allowed, max) => {
        if (!allowed.includes(file.mimetype)) {
          const error = new Error("Unsupported upload file type") as Error & { code?: string };
          error.code = "UNSUPPORTED_UPLOAD_FILE_TYPE";
          throw error;
        }
        if (file.size > max) {
          const error = new Error("Upload file is too large") as Error & { code?: string };
          error.code = "UPLOAD_FILE_TOO_LARGE";
          throw error;
        }
      })
    };
    const storage = new SupportAttachmentStorageService(cloudinary as never);
    const valid = await storage.upload({
      originalname: "receipt.png",
      mimetype: "image/png",
      size: 1024,
      buffer: Buffer.from("ok")
    });

    expect(valid).toMatchObject({ fileName: "receipt.png", fileType: "image/png", fileSize: 1024 });
    expect(() => storage.validate({ originalname: "bad.exe", mimetype: "application/x-msdownload", size: 10, buffer: Buffer.from("bad") })).toThrow();
    expect(() => storage.validate({ originalname: "large.pdf", mimetype: "application/pdf", size: 6 * 1024 * 1024, buffer: Buffer.from("bad") })).toThrow();
  });

  it("creates a support ticket and links uploaded attachments", async () => {
    const tx = {
      supportTicket: { create: jest.fn().mockResolvedValue({ id: "ticket_1", status: SupportTicketStatus.open, createdAt: new Date() }) },
      supportMessage: { create: jest.fn().mockResolvedValue({ id: "msg_1" }) },
      supportAttachment: {
        findMany: jest.fn().mockResolvedValue([{ url: "https://res.cloudinary.com/demo/receipt.png" }]),
        updateMany: jest.fn()
      }
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
      transaction: { findFirst: jest.fn() }
    };
    const service = new SupportService(prisma as never, {} as never, {} as never);

    await service.createTicket("user_1", {
      subject: "Help",
      message: "See receipt",
      attachmentUrls: ["https://res.cloudinary.com/demo/receipt.png"]
    });

    expect(tx.supportAttachment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { ticketId: "ticket_1", messageId: "msg_1" }
    }));
  });

  it("replies to a support ticket and links uploaded attachments", async () => {
    const tx = {
      supportMessage: { create: jest.fn().mockResolvedValue({ id: "msg_2" }) },
      supportAttachment: {
        findMany: jest.fn().mockResolvedValue([{ url: "https://res.cloudinary.com/demo/reply.png" }]),
        updateMany: jest.fn()
      },
      supportTicket: { update: jest.fn() }
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
      supportTicket: { findFirst: jest.fn().mockResolvedValue({ id: "ticket_1", status: SupportTicketStatus.open }) }
    };
    const service = new SupportService(prisma as never, {} as never, {} as never);

    await service.replyUser("user_1", "ticket_1", { message: "Attached", attachmentUrls: ["https://res.cloudinary.com/demo/reply.png"] });

    expect(tx.supportAttachment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { ticketId: "ticket_1", messageId: "msg_2" }
    }));
  });

  it("admin ticket details include message attachments", async () => {
    const prisma = {
      supportTicket: {
        findUnique: jest.fn().mockResolvedValue({
          id: "ticket_1",
          messages: [{ id: "msg_1", attachments: [{ id: "att_1", url: "https://res.cloudinary.com/demo/receipt.png" }] }]
        })
      }
    };
    const service = new SupportService(prisma as never, {} as never, {} as never);

    await expect(service.getAdminTicket("ticket_1")).resolves.toMatchObject({
      messages: [{ attachments: [{ id: "att_1" }] }]
    });
  });
});
