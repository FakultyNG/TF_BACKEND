import { NotificationAudience, NotificationStatus } from "@prisma/client";
import { DevicePlatform } from "../src/notifications/dto/register-device-token.dto";
import { NotificationsService } from "../src/notifications/notifications.service";
import { WebhookLogService } from "../src/webhooks/common/webhook-log.service";

describe("FCM notification delivery", () => {
  const publishedNotification = {
    id: "notif_1",
    title: "Wallet Funded",
    message: "NGN 50,000 added successfully",
    notificationCategory: "transaction",
    type: "wallet_funding",
    priority: "normal",
    imageUrl: null,
    deepLink: "tf://transactions/txn_1",
    audience: NotificationAudience.specific_user,
    targetUserId: "user_1",
    status: NotificationStatus.published,
    createdAt: new Date("2026-05-31T10:00:00Z")
  };

  it("registers and updates a user device token by deviceId", async () => {
    const prisma = {
      userDeviceToken: { upsert: jest.fn().mockResolvedValue({}) }
    };
    const service = new NotificationsService(prisma as never, {} as never);

    await expect(
      service.registerDeviceToken("user_1", {
        deviceId: "device_1",
        fcmToken: "token_1",
        platform: DevicePlatform.android
      })
    ).resolves.toEqual({ registered: true });

    expect(prisma.userDeviceToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_deviceId: { userId: "user_1", deviceId: "device_1" } },
        create: expect.objectContaining({ fcmToken: "token_1", isActive: true }),
        update: expect.objectContaining({ fcmToken: "token_1", isActive: true })
      })
    );
  });

  it("removes a user device token by deactivating it", async () => {
    const prisma = {
      userDeviceToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
    };
    const service = new NotificationsService(prisma as never, {} as never);

    await expect(service.removeDeviceToken("user_1", "device_1")).resolves.toEqual({ removed: true });
    expect(prisma.userDeviceToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1", deviceId: "device_1" },
        data: expect.objectContaining({ isActive: false })
      })
    );
  });

  it("pushes a published notification to active device tokens", async () => {
    const prisma = {
      userDeviceToken: {
        findMany: jest.fn().mockResolvedValue([{ id: "token_row_1", fcmToken: "fcm_token_1" }]),
        update: jest.fn()
      }
    };
    const firebase = {
      sendToMultipleDevices: jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0, responses: [{ success: true }] }),
      isInvalidTokenError: jest.fn().mockReturnValue(false)
    };
    const service = new NotificationsService(prisma as never, firebase as never);

    await expect(service.sendPushForNotification(publishedNotification)).resolves.toEqual({
      attempted: true,
      successCount: 1,
      failureCount: 0
    });
    expect(firebase.sendToMultipleDevices).toHaveBeenCalledWith(
      ["fcm_token_1"],
      expect.objectContaining({
        notification: expect.objectContaining({ title: "Wallet Funded", body: "NGN 50,000 added successfully" }),
        data: expect.objectContaining({ notificationId: "notif_1", deepLink: "tf://transactions/txn_1" })
      })
    );
  });

  it("skips inactive tokens and does not call Firebase when no active token exists", async () => {
    const prisma = {
      userDeviceToken: { findMany: jest.fn().mockResolvedValue([]) }
    };
    const firebase = { sendToMultipleDevices: jest.fn() };
    const service = new NotificationsService(prisma as never, firebase as never);

    await expect(service.sendPushForNotification(publishedNotification)).resolves.toEqual({
      attempted: false,
      successCount: 0,
      failureCount: 0
    });
    expect(firebase.sendToMultipleDevices).not.toHaveBeenCalled();
  });

  it("marks invalid Firebase tokens inactive", async () => {
    const prisma = {
      userDeviceToken: {
        findMany: jest.fn().mockResolvedValue([{ id: "token_row_1", fcmToken: "bad_token" }]),
        update: jest.fn().mockResolvedValue({})
      }
    };
    const firebase = {
      sendToMultipleDevices: jest.fn().mockResolvedValue({
        successCount: 0,
        failureCount: 1,
        responses: [{ success: false, errorCode: "messaging/registration-token-not-registered" }]
      }),
      isInvalidTokenError: jest.fn().mockReturnValue(true)
    };
    const service = new NotificationsService(prisma as never, firebase as never);

    await service.sendPushForNotification(publishedNotification);

    expect(prisma.userDeviceToken.update).toHaveBeenCalledWith({
      where: { id: "token_row_1" },
      data: { isActive: false }
    });
  });

  it("webhook notifications use the push-enabled notification service", async () => {
    const notifications = {
      createAndPushNotification: jest.fn().mockResolvedValue({})
    };
    const service = new WebhookLogService({} as never, notifications as never);

    await service.notifyUser({
      userId: "user_1",
      title: "Transfer successful",
      message: "Your transfer was successful.",
      category: "transaction",
      type: "transfer_success",
      deepLink: "tf://transactions/txn_1"
    });

    expect(notifications.createAndPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Transfer successful",
        targetUserId: "user_1",
        audience: NotificationAudience.specific_user,
        status: NotificationStatus.published
      })
    );
  });
});
