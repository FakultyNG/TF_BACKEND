CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'disabled');
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SUPPORT', 'COMPLIANCE');
CREATE TYPE "KycStatus" AS ENUM ('not_started', 'pending', 'bvn_verified', 'verified', 'rejected');
CREATE TYPE "WalletStatus" AS ENUM ('inactive', 'active');
CREATE TYPE "AuthSessionStatus" AS ENUM ('active', 'revoked', 'expired');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "passcodeHash" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'active',
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "walletStatus" "WalletStatus" NOT NULL DEFAULT 'inactive',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Profile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "email" TEXT,
  "dateOfBirth" TIMESTAMP(3),
  "country" TEXT,
  "profileImageUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KycRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kycReference" TEXT NOT NULL,
  "bvnHash" TEXT,
  "bvnVerified" BOOLEAN NOT NULL DEFAULT false,
  "selfieVerified" BOOLEAN NOT NULL DEFAULT false,
  "faceMatch" BOOLEAN NOT NULL DEFAULT false,
  "confidenceScore" DECIMAL(8,4),
  "status" "KycStatus" NOT NULL DEFAULT 'pending',
  "provider" TEXT NOT NULL DEFAULT 'mock',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KycRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "status" "AuthSessionStatus" NOT NULL DEFAULT 'active',
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "actorType" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");
CREATE INDEX "User_phoneNumber_idx" ON "User"("phoneNumber");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");
CREATE UNIQUE INDEX "KycRecord_kycReference_key" ON "KycRecord"("kycReference");
CREATE INDEX "KycRecord_userId_idx" ON "KycRecord"("userId");
CREATE INDEX "KycRecord_status_idx" ON "KycRecord"("status");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_status_idx" ON "AuthSession"("status");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KycRecord" ADD CONSTRAINT "KycRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
