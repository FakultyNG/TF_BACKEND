CREATE TABLE "AdminProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminProfile_userId_key" ON "AdminProfile"("userId");
CREATE INDEX "AdminProfile_isActive_idx" ON "AdminProfile"("isActive");
CREATE INDEX "AdminProfile_createdById_idx" ON "AdminProfile"("createdById");

ALTER TABLE "AdminProfile"
ADD CONSTRAINT "AdminProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
