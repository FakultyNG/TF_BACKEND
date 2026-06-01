import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { ApiException } from "../common/errors/api.exception";
import { pagination } from "../common/dto/pagination-query.dto";
import { PrismaService } from "../prisma/prisma.service";
import { DojahWebhookService } from "./dojah/dojah-webhook.service";
import { GiftCardProviderWebhookService } from "./gift-card-provider/gift-card-provider-webhook.service";
import { LyncWebhookService } from "./lync/lync-webhook.service";
import { PayoutProviderWebhookService } from "./payout-provider/payout-provider-webhook.service";
import { WebhookLogService } from "./common/webhook-log.service";
import { WebhookLogQueryDto } from "./dto/webhook-log-query.dto";

@Injectable()
export class AdminWebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: WebhookLogService,
    private readonly lync: LyncWebhookService,
    private readonly dojah: DojahWebhookService,
    private readonly payout: PayoutProviderWebhookService,
    private readonly giftCards: GiftCardProviderWebhookService
  ) {}

  async list(query: WebhookLogQueryDto) {
    const take = query.take ?? 50;
    const skip = query.skip ?? 0;
    const where: Prisma.WebhookLogWhereInput = {
      provider: query.provider,
      eventType: query.eventType,
      status: query.status,
      providerReference: query.providerReference,
      receivedAt: query.dateFrom || query.dateTo ? { gte: query.dateFrom ? new Date(query.dateFrom) : undefined, lte: query.dateTo ? new Date(query.dateTo) : undefined } : undefined
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.webhookLog.findMany({ where, take, skip, orderBy: { receivedAt: "desc" } }),
      this.prisma.webhookLog.count({ where })
    ]);
    return { items, pagination: pagination(Math.floor(skip / take) + 1, take, total) };
  }

  async get(id: string, role: UserRole) {
    const log = await this.prisma.webhookLog.findUnique({ where: { id }, include: { events: true } });
    if (!log) throw new ApiException("Webhook log not found", "WEBHOOK_LOG_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (role === UserRole.SUPER_ADMIN || role === UserRole.FINANCE || role === UserRole.COMPLIANCE) return log;
    return {
      ...log,
      rawPayload: this.logs.sanitize(log.rawPayload),
      normalizedPayload: this.logs.sanitize(log.normalizedPayload)
    };
  }

  async retry(adminId: string, id: string) {
    const log = await this.prisma.webhookLog.findUnique({ where: { id } });
    if (!log) throw new ApiException("Webhook log not found", "WEBHOOK_LOG_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (log.status === "processed" || log.status === "duplicate") {
      return { retried: false, status: log.status };
    }

    const result = await this.dispatchRetry(log.provider, id);
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: "admin",
        action: "ADMIN_WEBHOOK_RETRY",
        entityType: "WebhookLog",
        entityId: id,
        metadata: { provider: log.provider, eventType: log.eventType, duplicate: result.duplicate ?? false }
      }
    });
    return { retried: true, duplicate: result.duplicate ?? false };
  }

  async summary() {
    const [totalReceived, processed, failed, duplicate, byProvider, byEventType] = await this.prisma.$transaction([
      this.prisma.webhookLog.count(),
      this.prisma.webhookLog.count({ where: { status: "processed" } }),
      this.prisma.webhookLog.count({ where: { status: "failed" } }),
      this.prisma.webhookLog.count({ where: { status: "duplicate" } }),
      this.prisma.webhookLog.groupBy({ by: ["provider"], _count: true, orderBy: { provider: "asc" } }),
      this.prisma.webhookLog.groupBy({ by: ["eventType"], _count: true, orderBy: { eventType: "asc" } })
    ]);
    return {
      totalReceived,
      processed,
      failed,
      duplicate,
      byProvider: byProvider.map((item) => ({ provider: item.provider, count: item._count })),
      byEventType: byEventType.map((item) => ({ eventType: item.eventType, count: item._count }))
    };
  }

  private dispatchRetry(provider: string, id: string) {
    if (provider === "lync") return this.lync.retry(id);
    if (provider === "dojah") return this.dojah.retry(id);
    if (provider === "payout-provider") return this.payout.retry(id);
    if (provider === "reeplay") return this.giftCards.retry(id);
    throw new ApiException("Unsupported webhook provider", "UNSUPPORTED_WEBHOOK_PROVIDER", HttpStatus.BAD_REQUEST);
  }
}
