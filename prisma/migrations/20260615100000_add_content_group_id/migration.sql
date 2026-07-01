-- Cross-platform content grouping: same content piece on multiple
-- platforms shares a contentGroupId (the earliest member's Post.id).
ALTER TABLE "Post" ADD COLUMN "contentGroupId" TEXT;
CREATE INDEX "Post_contentGroupId_idx" ON "Post"("contentGroupId");
