ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'bill_payment';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'fee';

CREATE TYPE "SupportTicketStatus" AS ENUM ('open', 'pending', 'closed', 'reopened');
CREATE TYPE "SupportMessageSenderType" AS ENUM ('user', 'admin', 'system');
CREATE TYPE "BiometricMethod" AS ENUM ('face_id', 'fingerprint', 'biometric', 'unknown');
CREATE TYPE "NotificationStatus" AS ENUM ('draft', 'published', 'disabled');
CREATE TYPE "NotificationAudience" AS ENUM ('all_users', 'specific_user', 'user_segment');

ALTER TABLE "User" ADD COLUMN "supportNotes" TEXT;
ALTER TABLE "User" ADD COLUMN "riskNotes" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Profile" ADD COLUMN "gender" TEXT;

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'open',
  "assignedAdminId" TEXT,
  "relatedTransactionId" TEXT,
  "metadata" JSONB,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "senderType" "SupportMessageSenderType" NOT NULL,
  "senderId" TEXT,
  "message" TEXT NOT NULL,
  "attachmentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrustedDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "method" "BiometricMethod" NOT NULL DEFAULT 'unknown',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "disabledAt" TIMESTAMP(3),
  CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "notificationCategory" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "imageUrl" TEXT,
  "color" TEXT,
  "deepLink" TEXT,
  "ctaText" TEXT,
  "ctaUrl" TEXT,
  "audience" "NotificationAudience" NOT NULL DEFAULT 'specific_user',
  "targetUserId" TEXT,
  "segment" TEXT,
  "status" "NotificationStatus" NOT NULL DEFAULT 'draft',
  "createdById" TEXT,
  "sentAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationReceipt" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityAudit" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "deviceId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX "SupportTicket_category_idx" ON "SupportTicket"("category");
CREATE INDEX "SupportTicket_assignedAdminId_idx" ON "SupportTicket"("assignedAdminId");
CREATE INDEX "SupportTicket_relatedTransactionId_idx" ON "SupportTicket"("relatedTransactionId");
CREATE INDEX "SupportTicket_updatedAt_idx" ON "SupportTicket"("updatedAt");
CREATE INDEX "SupportMessage_ticketId_idx" ON "SupportMessage"("ticketId");
CREATE INDEX "SupportMessage_senderType_idx" ON "SupportMessage"("senderType");
CREATE INDEX "SupportMessage_createdAt_idx" ON "SupportMessage"("createdAt");
CREATE UNIQUE INDEX "TrustedDevice_userId_deviceId_key" ON "TrustedDevice"("userId", "deviceId");
CREATE UNIQUE INDEX "TrustedDevice_deviceId_key" ON "TrustedDevice"("deviceId");
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");
CREATE INDEX "TrustedDevice_enabled_idx" ON "TrustedDevice"("enabled");
CREATE INDEX "Notification_targetUserId_idx" ON "Notification"("targetUserId");
CREATE INDEX "Notification_notificationCategory_idx" ON "Notification"("notificationCategory");
CREATE INDEX "Notification_type_idx" ON "Notification"("type");
CREATE INDEX "Notification_priority_idx" ON "Notification"("priority");
CREATE INDEX "Notification_status_idx" ON "Notification"("status");
CREATE INDEX "Notification_audience_idx" ON "Notification"("audience");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE UNIQUE INDEX "NotificationReceipt_notificationId_userId_key" ON "NotificationReceipt"("notificationId", "userId");
CREATE INDEX "NotificationReceipt_userId_idx" ON "NotificationReceipt"("userId");
CREATE INDEX "NotificationReceipt_isRead_idx" ON "NotificationReceipt"("isRead");
CREATE INDEX "SecurityAudit_userId_idx" ON "SecurityAudit"("userId");
CREATE INDEX "SecurityAudit_action_idx" ON "SecurityAudit"("action");
CREATE INDEX "SecurityAudit_createdAt_idx" ON "SecurityAudit"("createdAt");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationReceipt" ADD CONSTRAINT "NotificationReceipt_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationReceipt" ADD CONSTRAINT "NotificationReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
