CREATE TABLE "FeeConfig" (
  "key" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "description" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeeConfig_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "FeeConfig" ADD CONSTRAINT "FeeConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
