CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SavedView_userId_idx" ON "SavedView"("userId");

CREATE TABLE "SharedReport" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "profileId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "SharedReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SharedReport_token_key" ON "SharedReport"("token");
CREATE INDEX "SharedReport_organizationId_idx" ON "SharedReport"("organizationId");
