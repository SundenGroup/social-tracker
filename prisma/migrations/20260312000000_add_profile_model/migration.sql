-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN "profileId" TEXT;

-- CreateIndex
CREATE INDEX "Profile_organizationId_idx" ON "Profile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_organizationId_name_key" ON "Profile"("organizationId", "name");

-- CreateIndex
CREATE INDEX "SocialAccount_profileId_idx" ON "SocialAccount"("profileId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
