ALTER TABLE "KycRecord"
  ADD COLUMN "providerReference" TEXT,
  ADD COLUMN "bvnMasked" TEXT,
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "middleName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "phoneNumber" TEXT,
  ADD COLUMN "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "ninMasked" TEXT,
  ADD COLUMN "ninHash" TEXT,
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "profileImageUrl" TEXT,
  ADD COLUMN "rawProviderLogId" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

CREATE INDEX "KycRecord_provider_idx" ON "KycRecord"("provider");
CREATE INDEX "KycRecord_providerReference_idx" ON "KycRecord"("providerReference");
CREATE INDEX "KycRecord_bvnHash_idx" ON "KycRecord"("bvnHash");
