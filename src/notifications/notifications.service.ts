import { HttpStatus, Injectable } from "@nestjs/common";
import { NotificationAudience, NotificationStatus, Prisma } from "@prisma/client";
import { offset, pagination } from "../common/dto/pagination-query.dto";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../prisma/prisma.service";
import { FirebaseService } from "../integrations/firebase/firebase.service";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_PRIORITIES, NOTIFICATION_TYPES } from "./notification.constants";
import { CreateNotificationDto } from "./dto/create-notification.dto";
import { NotificationQueryDto } from "./dto/notification-query.dto";
import { SendNotificationDto } from "./dto/send-notification.dto";
import { RegisterDeviceTokenDto } from "./dto/register-device-token.dto";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService
  ) {}

  categories() {
    return { items: NOTIFICATION_CATEGORIES };
  }

  priorities() {
    return { items: NOTIFICATION_PRIORITIES };
  }

  types() {
    return { items: NOTIFICATION_TYPES };
  }

  async listUserNotifications(userId: string, query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const visibleWhere = this.visibleWhere(userId, query);
    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: visibleWhere,
        take: limit,
        skip: offset(page, limit),
        orderBy: { createdAt: "desc" },
        include: { receipts: { where: { userId }, take: 1 } }
      }),
      this.prisma.notification.count({ where: visibleWhere })
    ]);
    const items = notifications
      .map((notification) => this.toUserNotification(notification))
      .filter((notification) => query.isRead === undefined || notification.isRead === query.isRead);
    return { items, pagination: pagination(page, limit, total) };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({ where: this.visibleWhere(userId, {}, notificationId) });
    if (!notification) throw new ApiException("Notification not found", "NOTIFICATION_NOT_FOUND", HttpStatus.NOT_FOUND);
    await this.prisma.notificationReceipt.upsert({
      where: { notificationId_userId: { notificationId, userId } },
      create: { notificationId, userId, isRead: true, readAt: new Date() },
      update: { isRead: true, readAt: new Date() }
    });
    return { notificationId, isRead: true };
  }

  async markAllRead(userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: this.visibleWhere(userId, {}),
      select: { id: true }
    });
    await this.prisma.$transaction(
      notifications.map((notification) =>
        this.prisma.notificationReceipt.upsert({
          where: { notificationId_userId: { notificationId: notification.id, userId } },
          create: { notificationId: notification.id, userId, isRead: true, readAt: new Date() },
          update: { isRead: true, readAt: new Date() }
        })
      )
    );
    return { updated: true, count: notifications.length };
  }

  async registerDeviceToken(userId: string, dto: RegisterDeviceTokenDto) {
    await this.prisma.userDeviceToken.upsert({
      where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
      create: {
        userId,
        deviceId: dto.deviceId,
        fcmToken: dto.fcmToken,
        platform: dto.platform,
        isActive: true,
        lastUsedAt: new Date()
      },
      update: {
        fcmToken: dto.fcmToken,
        platform: dto.platform,
        isActive: true,
        lastUsedAt: new Date()
      }
    });
    return { registered: true };
  }

  async removeDeviceToken(userId: string, deviceId: string) {
    await this.prisma.userDeviceToken.updateMany({
      where: { userId, deviceId },
      data: { isActive: false, lastUsedAt: new Date() }
    });
    return { removed: true };
  }

  async createNotification(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        title: input.title,
        message: input.message,
        notificationCategory: input.category,
        type: input.type,
        priority: input.priority ?? "normal",
        imageUrl: input.imageUrl,
        color: input.color,
        deepLink: input.deepLink,
        ctaText: input.ctaText,
        ctaUrl: input.ctaUrl,
        audience: input.audience ?? NotificationAudience.specific_user,
        targetUserId: input.targetUserId,
        segment: input.segment,
        status: input.status ?? NotificationStatus.published,
        createdById: input.createdById,
        sentAt: (input.status ?? NotificationStatus.published) === NotificationStatus.published ? new Date() : undefined
      }
    });
  }

  async createAndPushNotification(input: CreateNotificationInput) {
    const notification = await this.createNotification(input);
    const push = await this.sendPushForNotification(notification);
    return { notification, push };
  }

  async sendPushForNotification(notification: PushableNotification) {
    if (notification.status !== NotificationStatus.published) return { attempted: false, reason: "NOTIFICATION_NOT_PUBLISHED" };
    const tokens = await this.activeTokensForNotification(notification);
    if (!tokens.length) return { attempted: false, successCount: 0, failureCount: 0 };
    const payload = this.toFcmPayload(notification);
    const response = await this.firebase.sendToMultipleDevices(tokens.map((token) => token.fcmToken), payload);
    await Promise.all(
      response.responses.map((result, index) => {
        if (!result.success && this.firebase.isInvalidTokenError(result.errorCode)) {
          return this.prisma.userDeviceToken.update({ where: { id: tokens[index].id }, data: { isActive: false } });
        }
        return Promise.resolve();
      })
    );
    return { attempted: true, successCount: response.successCount, failureCount: response.failureCount };
  }

  async createAdmin(adminId: string, dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        title: dto.title,
        message: dto.message,
        notificationCategory: dto.notificationCategory,
        type: dto.type,
        priority: dto.priority || "normal",
        imageUrl: dto.imageUrl,
        color: dto.color,
        deepLink: dto.deepLink,
        ctaText: dto.ctaText,
        ctaUrl: dto.ctaUrl,
        audience: dto.audience || NotificationAudience.specific_user,
        targetUserId: dto.targetUserId,
        segment: dto.segment,
        status: dto.status || NotificationStatus.draft,
        createdById: adminId,
        sentAt: dto.status === NotificationStatus.published ? new Date() : undefined
      }
    });
    if (notification.status === NotificationStatus.published) await this.sendPushForNotification(notification);
    await this.audit(adminId, "ADMIN_NOTIFICATION_CREATED", notification.id, { status: notification.status });
    return notification;
  }

  async listAdmin(query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      notificationCategory: query.category,
      type: query.type,
      priority: query.priority
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, take: limit, skip: offset(page, limit), orderBy: { createdAt: "desc" } }),
      this.prisma.notification.count({ where })
    ]);
    return { items, pagination: pagination(page, limit, total) };
  }

  async getAdmin(id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      include: { receipts: { take: 50, orderBy: { createdAt: "desc" } } }
    });
    if (!notification) throw new ApiException("Notification not found", "NOTIFICATION_NOT_FOUND", HttpStatus.NOT_FOUND);
    return notification;
  }

  async updateAdmin(adminId: string, id: string, dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.update({
      where: { id },
      data: {
        title: dto.title,
        message: dto.message,
        notificationCategory: dto.notificationCategory,
        type: dto.type,
        priority: dto.priority,
        imageUrl: dto.imageUrl,
        color: dto.color,
        deepLink: dto.deepLink,
        ctaText: dto.ctaText,
        ctaUrl: dto.ctaUrl,
        audience: dto.audience,
        targetUserId: dto.targetUserId,
        segment: dto.segment,
        status: dto.status
      }
    });
    await this.audit(adminId, "ADMIN_NOTIFICATION_UPDATED", id, {});
    return notification;
  }

  async sendAdmin(adminId: string, id: string, dto: SendNotificationDto) {
    const notification = await this.prisma.notification.update({
      where: { id },
      data: {
        audience: dto.audience,
        targetUserId: dto.targetUserId,
        segment: dto.segment,
        status: NotificationStatus.published,
        sentAt: new Date()
      }
    });
    await this.sendPushForNotification(notification);
    await this.audit(adminId, "ADMIN_NOTIFICATION_SENT", id, { audience: dto.audience, targetUserId: dto.targetUserId, segment: dto.segment });
    return notification;
  }

  async disableAdmin(adminId: string, id: string) {
    const notification = await this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.disabled, disabledAt: new Date() }
    });
    await this.audit(adminId, "ADMIN_NOTIFICATION_DISABLED", id, {});
    return notification;
  }

  async deleteDraft(adminId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new ApiException("Notification not found", "NOTIFICATION_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (notification.status !== NotificationStatus.draft) {
      throw new ApiException("Only draft notifications can be deleted", "NOTIFICATION_NOT_DRAFT", HttpStatus.BAD_REQUEST);
    }
    await this.prisma.notification.delete({ where: { id } });
    await this.audit(adminId, "ADMIN_NOTIFICATION_DELETED", id, {});
    return { deleted: true };
  }

  private visibleWhere(userId: string, query: Partial<NotificationQueryDto>, id?: string): Prisma.NotificationWhereInput {
    return {
      id,
      status: NotificationStatus.published,
      notificationCategory: query.category,
      type: query.type,
      priority: query.priority,
      OR: [
        { audience: NotificationAudience.all_users },
        { audience: NotificationAudience.user_segment },
        { audience: NotificationAudience.specific_user, targetUserId: userId }
      ]
    };
  }

  private toUserNotification(notification: {
    id: string;
    type: string;
    notificationCategory: string;
    title: string;
    message: string;
    imageUrl: string | null;
    color: string | null;
    priority: string;
    deepLink: string | null;
    ctaText: string | null;
    ctaUrl: string | null;
    createdAt: Date;
    receipts: Array<{ isRead: boolean }>;
  }) {
    return {
      id: notification.id,
      type: notification.type,
      notificationCategory: notification.notificationCategory,
      title: notification.title,
      message: notification.message,
      mainHeader: notification.title,
      header: notification.title,
      body: notification.message,
      imageUrl: notification.imageUrl,
      color: notification.color,
      priority: notification.priority,
      deepLink: notification.deepLink,
      ctaText: notification.ctaText,
      ctaUrl: notification.ctaUrl,
      isRead: notification.receipts[0]?.isRead ?? false,
      createdAt: notification.createdAt
    };
  }

  private activeTokensForNotification(notification: PushableNotification) {
    if (notification.audience === NotificationAudience.specific_user && notification.targetUserId) {
      return this.prisma.userDeviceToken.findMany({ where: { userId: notification.targetUserId, isActive: true } });
    }
    if (notification.audience === NotificationAudience.all_users) {
      return this.prisma.userDeviceToken.findMany({ where: { isActive: true }, take: 500 });
    }
    return Promise.resolve([]);
  }

  private toFcmPayload(notification: PushableNotification) {
    return {
      notification: {
        title: notification.title,
        body: notification.message,
        imageUrl: notification.imageUrl ?? undefined
      },
      data: {
        notificationId: notification.id,
        deepLink: notification.deepLink ?? "",
        type: notification.type,
        category: notification.notificationCategory,
        priority: notification.priority,
        imageUrl: notification.imageUrl ?? "",
        createdAt: notification.createdAt.toISOString()
      }
    };
  }

  private audit(adminId: string, action: string, entityId: string, metadata: Prisma.InputJsonObject) {
    return this.prisma.auditLog.create({
      data: { actorId: adminId, actorType: "admin", action, entityType: "Notification", entityId, metadata }
    });
  }
}

export interface CreateNotificationInput {
  title: string;
  message: string;
  category: string;
  type: string;
  priority?: string;
  imageUrl?: string;
  color?: string;
  deepLink?: string;
  ctaText?: string;
  ctaUrl?: string;
  audience?: NotificationAudience;
  targetUserId?: string;
  segment?: string;
  status?: NotificationStatus;
  createdById?: string;
}

type PushableNotification = {
  id: string;
  title: string;
  message: string;
  notificationCategory: string;
  type: string;
  priority: string;
  imageUrl: string | null;
  deepLink: string | null;
  audience: NotificationAudience;
  targetUserId: string | null;
  status: NotificationStatus;
  createdAt: Date;
};
