import { HttpStatus, Injectable } from "@nestjs/common";
import { NotificationAudience, NotificationStatus, Prisma, SupportMessageSenderType, SupportTicketStatus } from "@prisma/client";
import { ApiException } from "../common/errors/api.exception";
import { offset, pagination } from "../common/dto/pagination-query.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSupportTicketDto } from "./dto/create-support-ticket.dto";
import { ReplySupportTicketDto } from "./dto/reply-support-ticket.dto";
import { SupportTicketQueryDto } from "./dto/support-ticket-query.dto";
import { SupportAttachmentStorageService, SupportUploadFile } from "./support-attachment-storage.service";

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupportAttachmentStorageService,
    private readonly notifications: NotificationsService
  ) {}

  async uploadAttachment(userId: string, file: SupportUploadFile) {
    const uploaded = await this.storage.upload(file);
    await this.prisma.supportAttachment.create({
      data: {
        userId,
        url: uploaded.attachmentUrl,
        fileName: uploaded.fileName,
        fileType: uploaded.fileType,
        fileSize: uploaded.fileSize,
        storageProvider: "cloudinary"
      }
    });
    return uploaded;
  }

  async createTicket(userId: string, dto: CreateSupportTicketDto) {
    const relatedTransaction = dto.transactionId
      ? await this.prisma.transaction.findFirst({ where: { id: dto.transactionId, userId } })
      : null;
    if (dto.transactionId && !relatedTransaction) {
      throw new ApiException("Transaction not found", "TRANSACTION_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          userId,
          subject: dto.subject,
          category: dto.category || this.inferCategory(relatedTransaction?.type),
          status: SupportTicketStatus.open,
          relatedTransactionId: relatedTransaction?.id,
          metadata: relatedTransaction
            ? ({
                transactionType: relatedTransaction.type,
                transactionStatus: relatedTransaction.status,
                transactionReference: relatedTransaction.reference
              } as Prisma.InputJsonObject)
            : undefined
        }
      });
      const message = await tx.supportMessage.create({
        data: {
          ticketId: created.id,
          senderType: SupportMessageSenderType.user,
          senderId: userId,
          message: dto.message,
          attachmentUrl: dto.attachmentUrls?.[0]
        }
      });
      await this.linkAttachmentsTx(tx, userId, this.attachmentUrls(dto), created.id, message.id);
      return created;
    });
    return { ticketId: ticket.id, status: ticket.status, createdAt: ticket.createdAt };
  }

  async listUserTickets(userId: string, query: SupportTicketQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      userId,
      status: query.status,
      category: query.category
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        take: limit,
        skip: offset(page, limit),
        orderBy: { updatedAt: "desc" },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1, include: { attachments: true } } }
      }),
      this.prisma.supportTicket.count({ where })
    ]);
    return {
      items: items.map((ticket) => ({
        ticketId: ticket.id,
        subject: ticket.subject,
        category: ticket.category,
        status: ticket.status,
        lastMessage: ticket.messages[0]?.message ?? null,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      })),
      pagination: pagination(page, limit, total)
    };
  }

  async getUserTicket(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      include: { messages: { orderBy: { createdAt: "asc", }, include: { attachments: true } } }
    });
    if (!ticket) throw new ApiException("Support ticket not found", "SUPPORT_TICKET_NOT_FOUND", HttpStatus.NOT_FOUND);
    return this.toTicketDetails(ticket);
  }

  async replyUser(userId: string, ticketId: string, dto: ReplySupportTicketDto) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id: ticketId, userId } });
    if (!ticket) throw new ApiException("Support ticket not found", "SUPPORT_TICKET_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (ticket.status === SupportTicketStatus.closed) {
      throw new ApiException("Support ticket is closed", "SUPPORT_TICKET_CLOSED", HttpStatus.BAD_REQUEST);
    }
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({
        data: {
          ticketId,
          senderType: SupportMessageSenderType.user,
          senderId: userId,
          message: dto.message,
          attachmentUrl: dto.attachmentUrl ?? dto.attachmentUrls?.[0]
        }
      });
      await this.linkAttachmentsTx(tx, userId, this.attachmentUrls(dto), ticketId, created.id);
      await tx.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
      return created;
    });
    return { ticketId, replyId: message.id, messageId: message.id, status: ticket.status };
  }

  async closeUserTicket(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id: ticketId, userId } });
    if (!ticket) throw new ApiException("Support ticket not found", "SUPPORT_TICKET_NOT_FOUND", HttpStatus.NOT_FOUND);
    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: SupportTicketStatus.closed, closedAt: new Date() }
    });
    return { ticketId: updated.id, status: updated.status };
  }

  async listAdminTickets(query: { page?: number; limit?: number; status?: SupportTicketStatus; category?: string; userId?: string; assignedAdminId?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      status: query.status,
      category: query.category,
      userId: query.userId,
      assignedAdminId: query.assignedAdminId
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        take: limit,
        skip: offset(page, limit),
        orderBy: { updatedAt: "desc" },
        include: {
          user: { select: { id: true, phoneNumber: true, profile: true } },
          assignedAdmin: { select: { id: true, phoneNumber: true, role: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, include: { attachments: true } }
        }
      }),
      this.prisma.supportTicket.count({ where })
    ]);
    return { items, pagination: pagination(page, limit, total) };
  }

  async getAdminTicket(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, phoneNumber: true, profile: true, walletStatus: true } },
        assignedAdmin: { select: { id: true, phoneNumber: true, role: true } },
        relatedTransaction: true,
        messages: { orderBy: { createdAt: "asc" }, include: { attachments: true } }
      }
    });
    if (!ticket) throw new ApiException("Support ticket not found", "SUPPORT_TICKET_NOT_FOUND", HttpStatus.NOT_FOUND);
    return ticket;
  }

  async adminReply(adminId: string, ticketId: string, dto: ReplySupportTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new ApiException("Support ticket not found", "SUPPORT_TICKET_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (ticket.status === SupportTicketStatus.closed) {
      throw new ApiException("Support ticket is closed", "SUPPORT_TICKET_CLOSED", HttpStatus.BAD_REQUEST);
    }
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({
        data: {
          ticketId,
          senderType: SupportMessageSenderType.admin,
          senderId: adminId,
          message: dto.message,
          attachmentUrl: dto.attachmentUrl ?? dto.attachmentUrls?.[0]
        }
      });
      await this.linkAttachmentsTx(tx, adminId, this.attachmentUrls(dto), ticketId, created.id);
      await tx.supportTicket.update({ where: { id: ticketId }, data: { status: SupportTicketStatus.pending, updatedAt: new Date() } });
      await tx.auditLog.create({
        data: { actorId: adminId, actorType: "admin", action: "ADMIN_SUPPORT_REPLY", entityType: "SupportTicket", entityId: ticketId, metadata: { messageId: created.id } }
      });
      return created;
    });
    await this.notifications.createAndPushNotification({
      title: "Support replied",
      message: "Support has replied to your ticket.",
      category: "support",
      type: "support_reply",
      audience: NotificationAudience.specific_user,
      targetUserId: ticket.userId,
      status: NotificationStatus.published,
      deepLink: `tf://support/tickets/${ticketId}`
    });
    return { ticketId, messageId: message.id, status: SupportTicketStatus.pending };
  }

  async assign(adminId: string, ticketId: string, assignedAdminId: string) {
    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { assignedAdminId, updatedAt: new Date() }
    });
    await this.audit(adminId, "ADMIN_SUPPORT_ASSIGNED", "SupportTicket", ticketId, { assignedAdminId });
    return updated;
  }

  async adminClose(adminId: string, ticketId: string) {
    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: SupportTicketStatus.closed, closedAt: new Date() }
    });
    await this.audit(adminId, "ADMIN_SUPPORT_CLOSED", "SupportTicket", ticketId, {});
    return { ticketId: updated.id, status: updated.status };
  }

  async reopen(adminId: string, ticketId: string) {
    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: SupportTicketStatus.reopened, closedAt: null, updatedAt: new Date() }
    });
    await this.audit(adminId, "ADMIN_SUPPORT_REOPENED", "SupportTicket", ticketId, {});
    return { ticketId: updated.id, status: updated.status };
  }

  private toTicketDetails(ticket: {
    id: string;
    relatedTransactionId: string | null;
    subject: string;
    category: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    messages: Array<{
      id?: string;
      senderType: string;
      message: string;
      attachmentUrl: string | null;
      createdAt: Date;
      attachments?: Array<{ id: string; url: string; fileName: string; fileType: string; fileSize: number; storageProvider: string; createdAt: Date }>;
    }>;
  }) {
    return {
      ticketId: ticket.id,
      transactionId: ticket.relatedTransactionId,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      messages: ticket.messages.map((message) => ({
        sender: message.senderType === "admin" ? "support" : message.senderType,
        message: message.message,
        attachmentUrl: message.attachmentUrl,
        attachmentUrls: message.attachments?.map((attachment) => attachment.url) ?? (message.attachmentUrl ? [message.attachmentUrl] : []),
        attachments: message.attachments ?? [],
        createdAt: message.createdAt
      }))
    };
  }

  private attachmentUrls(dto: { attachmentUrl?: string; attachmentUrls?: string[] }) {
    return Array.from(new Set([...(dto.attachmentUrls ?? []), ...(dto.attachmentUrl ? [dto.attachmentUrl] : [])]));
  }

  private async linkAttachmentsTx(tx: Prisma.TransactionClient, userId: string, urls: string[], ticketId: string, messageId: string) {
    if (!urls.length) return;
    const existing = await tx.supportAttachment.findMany({
      where: { userId, url: { in: urls } },
      select: { url: true }
    });
    if (existing.length !== urls.length) {
      throw new ApiException("Support attachment not found", "SUPPORT_ATTACHMENT_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    await tx.supportAttachment.updateMany({
      where: { userId, url: { in: urls } },
      data: { ticketId, messageId }
    });
  }

  private inferCategory(type?: string) {
    if (!type) return "general";
    if (type.includes("transfer")) return "transfer";
    if (type === "wallet_funding") return "wallet";
    if (type === "gift_card") return "gift_card";
    return "general";
  }

  private audit(actorId: string, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject) {
    return this.prisma.auditLog.create({
      data: { actorId, actorType: "admin", action, entityType, entityId, metadata }
    });
  }
}
