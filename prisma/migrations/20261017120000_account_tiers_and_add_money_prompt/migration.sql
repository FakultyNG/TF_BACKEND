CREATE TYPE "AccountTier" AS ENUM ('citizen', 'captain', 'prime');

ALTER TABLE "User"
ADD COLUMN "accountTier" "AccountTier" NOT NULL DEFAULT 'citizen',
ADD COLUMN "addMoneyClickedAt" TIMESTAMP(3);

CREATE INDEX "User_accountTier_idx" ON "User"("accountTier");
