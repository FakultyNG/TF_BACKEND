-- Failed BVN checks must not reserve an identity.
UPDATE "KycRecord"
SET "bvnHash" = NULL
WHERE "bvnVerified" = false;

-- A verified BVN can belong to only one Transfa account.
DROP INDEX IF EXISTS "KycRecord_bvnHash_idx";
CREATE UNIQUE INDEX "KycRecord_bvnHash_key" ON "KycRecord"("bvnHash");
