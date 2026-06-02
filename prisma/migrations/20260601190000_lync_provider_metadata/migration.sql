ALTER TABLE "Transaction" ADD COLUMN "providerStatus" TEXT;

ALTER TABLE "ProviderLog" ADD COLUMN "errorMessage" TEXT;

CREATE INDEX "DedicatedVirtualAccount_provider_idx" ON "DedicatedVirtualAccount"("provider");
CREATE INDEX "DedicatedVirtualAccount_providerReference_idx" ON "DedicatedVirtualAccount"("providerReference");
CREATE INDEX "Transaction_provider_idx" ON "Transaction"("provider");
CREATE INDEX "Transaction_providerReference_idx" ON "Transaction"("providerReference");
