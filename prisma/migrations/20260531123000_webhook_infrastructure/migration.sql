CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerReference" TEXT,
    "internalReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "rawPayload" JSONB NOT NULL,
    "normalizedPayload" JSONB,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "webhookLogId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerReference" TEXT,
    "internalEntityType" TEXT NOT NULL,
    "internalEntityId" TEXT,
    "processingStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookLog_provider_idx" ON "WebhookLog"("provider");
CREATE INDEX "WebhookLog_eventType_idx" ON "WebhookLog"("eventType");
CREATE INDEX "WebhookLog_providerReference_idx" ON "WebhookLog"("providerReference");
CREATE INDEX "WebhookLog_status_idx" ON "WebhookLog"("status");
CREATE INDEX "WebhookLog_receivedAt_idx" ON "WebhookLog"("receivedAt");

CREATE INDEX "WebhookEvent_webhookLogId_idx" ON "WebhookEvent"("webhookLogId");
CREATE INDEX "WebhookEvent_provider_idx" ON "WebhookEvent"("provider");
CREATE INDEX "WebhookEvent_eventType_idx" ON "WebhookEvent"("eventType");
CREATE INDEX "WebhookEvent_providerReference_idx" ON "WebhookEvent"("providerReference");
CREATE INDEX "WebhookEvent_processingStatus_idx" ON "WebhookEvent"("processingStatus");

CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");
CREATE INDEX "IdempotencyKey_provider_idx" ON "IdempotencyKey"("provider");
CREATE INDEX "IdempotencyKey_eventType_idx" ON "IdempotencyKey"("eventType");
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_webhookLogId_fkey" FOREIGN KEY ("webhookLogId") REFERENCES "WebhookLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
