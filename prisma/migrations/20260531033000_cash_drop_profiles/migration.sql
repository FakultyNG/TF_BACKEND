CREATE TYPE "CashDropProfileStatus" AS ENUM ('active', 'disabled');

CREATE TABLE "CASH_DROP_profiles" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dvaId" TEXT NOT NULL,
  "profileImageUrl" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "fingerprintHash" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL DEFAULT 'avg_hash_16x16_v1',
  "status" "CashDropProfileStatus" NOT NULL DEFAULT 'active',
  "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CASH_DROP_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CASH_DROP_profiles_userId_key" ON "CASH_DROP_profiles"("userId");
CREATE INDEX "CASH_DROP_profiles_status_idx" ON "CASH_DROP_profiles"("status");
CREATE INDEX "CASH_DROP_profiles_dvaId_idx" ON "CASH_DROP_profiles"("dvaId");

ALTER TABLE "CASH_DROP_profiles" ADD CONSTRAINT "CASH_DROP_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CASH_DROP_profiles" ADD CONSTRAINT "CASH_DROP_profiles_dvaId_fkey" FOREIGN KEY ("dvaId") REFERENCES "DedicatedVirtualAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
