CREATE TABLE "UserDeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDeviceToken_userId_deviceId_key" ON "UserDeviceToken"("userId", "deviceId");
CREATE INDEX "UserDeviceToken_userId_idx" ON "UserDeviceToken"("userId");
CREATE INDEX "UserDeviceToken_deviceId_idx" ON "UserDeviceToken"("deviceId");
CREATE INDEX "UserDeviceToken_fcmToken_idx" ON "UserDeviceToken"("fcmToken");
CREATE INDEX "UserDeviceToken_isActive_idx" ON "UserDeviceToken"("isActive");

ALTER TABLE "UserDeviceToken" ADD CONSTRAINT "UserDeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
