-- AddColumn: User.profileId (nullable). NULL means "all profiles in org".
ALTER TABLE "User" ADD COLUMN "profileId" TEXT;

-- CreateIndex
CREATE INDEX "User_profileId_idx" ON "User"("profileId");

-- AddForeignKey: when a profile is deleted, users scoped to it fall back to
-- "all profiles" rather than being orphaned.
ALTER TABLE "User" ADD CONSTRAINT "User_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
