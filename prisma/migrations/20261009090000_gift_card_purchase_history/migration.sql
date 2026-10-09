ALTER TYPE "GiftCardPurchaseStatus" ADD VALUE IF NOT EXISTS 'expired';

ALTER TABLE "GiftCardProduct"
ADD COLUMN "imageUrl" TEXT;

ALTER TABLE "GiftCardPurchase"
ADD COLUMN "redemptionInstructions" TEXT,
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3);
