-- Multi-profile share scope. Preserve existing links: a pinned single
-- profileId becomes a one-element array.
ALTER TABLE "SharedReport" ADD COLUMN "profileIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "SharedReport" SET "profileIds" = ARRAY["profileId"] WHERE "profileId" IS NOT NULL;
ALTER TABLE "SharedReport" DROP COLUMN "profileId";
