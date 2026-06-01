ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FINANCE';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

CREATE TYPE "DvaStatus" AS ENUM ('active', 'inactive', 'failed');
CREATE TYPE "LedgerEntryType" AS ENUM ('credit', 'debit', 'reversal', 'adjustment');
CREATE TYPE "TransactionType" AS ENUM ('wallet_funding', 'ngn_transfer', 'usd_transfer', 'cny_transfer', 'gift_card', 'wallet_adjustment', 'reversal');
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'processing', 'successful', 'failed', 'reversed');
CREATE TYPE "GiftCardProductStatus" AS ENUM ('active', 'disabled');
CREATE TYPE "GiftCardPurchaseStatus" AS ENUM ('processing', 'delivered', 'failed', 'reversed');

CREATE TABLE "Wallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "balance" INTEGER NOT NULL DEFAULT 0,
  "status" "WalletStatus" NOT NULL DEFAULT 'inactive',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletLedger" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "transactionId" TEXT,
  "entryType" "LedgerEntryType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceBefore" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "reference" TEXT,
  "description" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DedicatedVirtualAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "preferredBank" TEXT,
  "status" "DvaStatus" NOT NULL DEFAULT 'active',
  "providerReference" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DedicatedVirtualAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "TransactionType" NOT NULL,
  "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
  "amount" INTEGER NOT NULL,
  "fee" INTEGER NOT NULL DEFAULT 0,
  "totalDebit" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "payoutAmount" INTEGER,
  "payoutCurrency" TEXT,
  "reference" TEXT NOT NULL,
  "provider" TEXT,
  "providerReference" TEXT,
  "description" TEXT,
  "narration" TEXT,
  "idempotencyKey" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GiftCardProduct" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "minAmount" INTEGER NOT NULL,
  "maxAmount" INTEGER NOT NULL,
  "status" "GiftCardProductStatus" NOT NULL DEFAULT 'active',
  "provider" TEXT NOT NULL DEFAULT 'mock',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GiftCardProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GiftCardPurchase" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "giftCardId" TEXT NOT NULL,
  "giftCardName" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "GiftCardPurchaseStatus" NOT NULL DEFAULT 'processing',
  "recipientEmail" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'mock',
  "providerReference" TEXT,
  "redemptionCode" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GiftCardPurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderLog" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requestReference" TEXT,
  "providerReference" TEXT,
  "status" TEXT NOT NULL,
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");
CREATE INDEX "Wallet_status_idx" ON "Wallet"("status");
CREATE INDEX "WalletLedger_walletId_idx" ON "WalletLedger"("walletId");
CREATE INDEX "WalletLedger_userId_idx" ON "WalletLedger"("userId");
CREATE INDEX "WalletLedger_transactionId_idx" ON "WalletLedger"("transactionId");
CREATE INDEX "WalletLedger_reference_idx" ON "WalletLedger"("reference");
CREATE UNIQUE INDEX "DedicatedVirtualAccount_provider_accountNumber_key" ON "DedicatedVirtualAccount"("provider", "accountNumber");
CREATE INDEX "DedicatedVirtualAccount_userId_idx" ON "DedicatedVirtualAccount"("userId");
CREATE INDEX "DedicatedVirtualAccount_status_idx" ON "DedicatedVirtualAccount"("status");
CREATE UNIQUE INDEX "Transaction_reference_key" ON "Transaction"("reference");
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");
CREATE UNIQUE INDEX "GiftCardPurchase_transactionId_key" ON "GiftCardPurchase"("transactionId");
CREATE INDEX "GiftCardPurchase_userId_idx" ON "GiftCardPurchase"("userId");
CREATE INDEX "GiftCardPurchase_giftCardId_idx" ON "GiftCardPurchase"("giftCardId");
CREATE INDEX "GiftCardPurchase_status_idx" ON "GiftCardPurchase"("status");
CREATE INDEX "ProviderLog_provider_idx" ON "ProviderLog"("provider");
CREATE INDEX "ProviderLog_operation_idx" ON "ProviderLog"("operation");
CREATE INDEX "ProviderLog_requestReference_idx" ON "ProviderLog"("requestReference");

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DedicatedVirtualAccount" ADD CONSTRAINT "DedicatedVirtualAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftCardPurchase" ADD CONSTRAINT "GiftCardPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftCardPurchase" ADD CONSTRAINT "GiftCardPurchase_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftCardPurchase" ADD CONSTRAINT "GiftCardPurchase_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCardProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
