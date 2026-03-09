-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('youtube', 'twitter', 'instagram', 'tiktok');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'viewer');

-- CreateEnum
CREATE TYPE "ContentFilter" AS ENUM ('all', 'video_only');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'syncing', 'success', 'failed');

-- CreateEnum
CREATE TYPE "DataImportStatus" AS ENUM ('pending', 'processing', 'success', 'failed', 'partial');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('initial_full_sync', 'daily_update', 'manual_trigger');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('video', 'image', 'carousel', 'text', 'short', 'live', 'story');

-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('views', 'impressions', 'likes', 'comments', 'shares', 'engagement_rate', 'reach', 'watch_duration', 'ctr', 'bookmarks', 'followers', 'profile_visits');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'viewer',
    "organizationId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "contentFilter" "ContentFilter" NOT NULL DEFAULT 'all',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "apiKey" TEXT,
    "authToken" TEXT,
    "refreshToken" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "postId" TEXT NOT NULL,
    "postType" "PostType" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "contentUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "lastMetricRefreshAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isTrending" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostMetric" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "metricDate" DATE NOT NULL,
    "metricType" "MetricType" NOT NULL,
    "metricValue" BIGINT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDailyRollup" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "rollupDate" DATE NOT NULL,
    "totalViews" BIGINT NOT NULL DEFAULT 0,
    "totalLikes" BIGINT NOT NULL DEFAULT 0,
    "totalComments" BIGINT NOT NULL DEFAULT 0,
    "totalShares" BIGINT NOT NULL DEFAULT 0,
    "totalImpressions" BIGINT NOT NULL DEFAULT 0,
    "totalReach" BIGINT NOT NULL DEFAULT 0,
    "newFollowers" BIGINT NOT NULL DEFAULT 0,
    "totalFollowers" BIGINT NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "postsPublished" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDailyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "syncType" "SyncType" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "postsSynced" INTEGER NOT NULL DEFAULT 0,
    "metricsSynced" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "platform" "Platform",
    "status" "DataImportStatus" NOT NULL DEFAULT 'pending',
    "errorDetails" TEXT,
    "rowsAttempted" INTEGER NOT NULL DEFAULT 0,
    "rowsSuccessful" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "Organization_ownerId_idx" ON "Organization"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "SocialAccount_organizationId_platform_idx" ON "SocialAccount"("organizationId", "platform");

-- CreateIndex
CREATE INDEX "SocialAccount_platform_accountId_idx" ON "SocialAccount"("platform", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_organizationId_platform_accountId_key" ON "SocialAccount"("organizationId", "platform", "accountId");

-- CreateIndex
CREATE INDEX "Post_socialAccountId_publishedAt_idx" ON "Post"("socialAccountId", "publishedAt");

-- CreateIndex
CREATE INDEX "Post_platform_publishedAt_idx" ON "Post"("platform", "publishedAt");

-- CreateIndex
CREATE INDEX "Post_lastMetricRefreshAt_idx" ON "Post"("lastMetricRefreshAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_socialAccountId_postId_key" ON "Post"("socialAccountId", "postId");

-- CreateIndex
CREATE INDEX "PostMetric_postId_metricType_metricDate_idx" ON "PostMetric"("postId", "metricType", "metricDate");

-- CreateIndex
CREATE INDEX "PostMetric_socialAccountId_metricType_metricDate_idx" ON "PostMetric"("socialAccountId", "metricType", "metricDate");

-- CreateIndex
CREATE INDEX "PostMetric_socialAccountId_metricDate_idx" ON "PostMetric"("socialAccountId", "metricDate");

-- CreateIndex
CREATE UNIQUE INDEX "PostMetric_postId_metricType_metricDate_key" ON "PostMetric"("postId", "metricType", "metricDate");

-- CreateIndex
CREATE INDEX "AccountDailyRollup_socialAccountId_rollupDate_idx" ON "AccountDailyRollup"("socialAccountId", "rollupDate");

-- CreateIndex
CREATE INDEX "AccountDailyRollup_socialAccountId_platform_rollupDate_idx" ON "AccountDailyRollup"("socialAccountId", "platform", "rollupDate");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDailyRollup_socialAccountId_rollupDate_key" ON "AccountDailyRollup"("socialAccountId", "rollupDate");

-- CreateIndex
CREATE INDEX "SyncLog_socialAccountId_createdAt_idx" ON "SyncLog"("socialAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncLog_status_createdAt_idx" ON "SyncLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DataImport_organizationId_createdAt_idx" ON "DataImport"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "DataImport_status_createdAt_idx" ON "DataImport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMetric" ADD CONSTRAINT "PostMetric_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMetric" ADD CONSTRAINT "PostMetric_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDailyRollup" ADD CONSTRAINT "AccountDailyRollup_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataImport" ADD CONSTRAINT "DataImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataImport" ADD CONSTRAINT "DataImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
