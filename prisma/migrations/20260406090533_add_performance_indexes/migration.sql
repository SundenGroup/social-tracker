-- CreateIndex
CREATE INDEX "Post_isDeleted_socialAccountId_publishedAt_idx" ON "Post"("isDeleted", "socialAccountId", "publishedAt");

-- CreateIndex
CREATE INDEX "SocialAccount_organizationId_isActive_idx" ON "SocialAccount"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "SyncLog_socialAccountId_status_startedAt_idx" ON "SyncLog"("socialAccountId", "status", "startedAt");
