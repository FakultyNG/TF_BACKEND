CREATE TABLE "RecentBeneficiary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "bankName" TEXT,
    "bankCode" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "supplierName" TEXT,
    "supplierCountry" TEXT,
    "payoutCurrency" TEXT,
    "beneficiaryJson" JSONB,
    "paymentReference" TEXT,
    "transactionId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecentBeneficiary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT,
    "messageId" TEXT,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'cloudinary',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecentBeneficiary_dedupeKey_key" ON "RecentBeneficiary"("dedupeKey");
CREATE INDEX "RecentBeneficiary_userId_idx" ON "RecentBeneficiary"("userId");
CREATE INDEX "RecentBeneficiary_type_idx" ON "RecentBeneficiary"("type");
CREATE INDEX "RecentBeneficiary_accountNumber_idx" ON "RecentBeneficiary"("accountNumber");
CREATE INDEX "RecentBeneficiary_displayName_idx" ON "RecentBeneficiary"("displayName");
CREATE INDEX "RecentBeneficiary_lastUsedAt_idx" ON "RecentBeneficiary"("lastUsedAt");

CREATE INDEX "SupportAttachment_ticketId_idx" ON "SupportAttachment"("ticketId");
CREATE INDEX "SupportAttachment_messageId_idx" ON "SupportAttachment"("messageId");
CREATE INDEX "SupportAttachment_userId_idx" ON "SupportAttachment"("userId");
CREATE INDEX "SupportAttachment_url_idx" ON "SupportAttachment"("url");

ALTER TABLE "RecentBeneficiary" ADD CONSTRAINT "RecentBeneficiary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecentBeneficiary" ADD CONSTRAINT "RecentBeneficiary_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
