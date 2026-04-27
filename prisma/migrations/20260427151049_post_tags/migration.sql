-- Post tagging + per-account auto-tag rules.
-- See plan: post tagging + per-partner content filter.

-- 1. Per-account auto-tagging configuration.
ALTER TABLE "SocialAccount" ADD COLUMN "defaultTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SocialAccount" ADD COLUMN "tagRules" JSONB;

-- 2. Per-post tag arrays. `tags` is the queryable union (auto + manual);
--    `manualTags` is the human-pinned set preserved across recomputes.
ALTER TABLE "Post" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Post" ADD COLUMN "manualTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 3. GIN index on Post.tags so `tags @> ARRAY[?]` (Prisma `has`) and
--    `tags && ARRAY[?]` (Prisma `hasSome`) stay sub-millisecond at
--    100K+ rows. Without GIN, Prisma falls back to a seqscan on
--    every dashboard query.
CREATE INDEX "Post_tags_idx" ON "Post" USING GIN ("tags");
