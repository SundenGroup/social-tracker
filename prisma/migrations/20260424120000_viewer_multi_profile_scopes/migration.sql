-- Migrate viewer→profile scoping from a nullable single FK on User to a
-- dedicated join table, so a viewer can be assigned to any number of
-- profiles (English + Turkish, say). Zero rows = "all profiles".

-- 1. Create the join table.
CREATE TABLE "UserProfileScope" (
    "userId"    TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserProfileScope_pkey" PRIMARY KEY ("userId", "profileId")
);

CREATE INDEX "UserProfileScope_profileId_idx" ON "UserProfileScope"("profileId");

ALTER TABLE "UserProfileScope" ADD CONSTRAINT "UserProfileScope_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserProfileScope" ADD CONSTRAINT "UserProfileScope_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Seed the new table from the existing single-scope column so existing
--    viewers keep exactly the scope they had.
INSERT INTO "UserProfileScope" ("userId", "profileId")
SELECT "id", "profileId" FROM "User" WHERE "profileId" IS NOT NULL
ON CONFLICT ("userId", "profileId") DO NOTHING;

-- 3. Drop the old column + its FK + index.
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_profileId_fkey";
DROP INDEX IF EXISTS "User_profileId_idx";
ALTER TABLE "User" DROP COLUMN "profileId";
