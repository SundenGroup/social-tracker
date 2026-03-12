/**
 * Data migration: Create default profiles for existing organizations
 * and assign all existing social accounts to them.
 *
 * Usage: npx tsx scripts/migrate-profiles.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
  });

  console.log(`Found ${orgs.length} organization(s)`);

  for (const org of orgs) {
    // Check if a default profile already exists
    const existing = await prisma.profile.findFirst({
      where: { organizationId: org.id, isDefault: true },
    });

    if (existing) {
      console.log(`[${org.name}] Default profile already exists, skipping creation`);
    }

    const profile = existing ?? await prisma.profile.create({
      data: {
        organizationId: org.id,
        name: "Default",
        isDefault: true,
      },
    });

    // Assign all unassigned accounts to the default profile
    const updated = await prisma.socialAccount.updateMany({
      where: {
        organizationId: org.id,
        profileId: null,
      },
      data: {
        profileId: profile.id,
      },
    });

    console.log(`[${org.name}] Assigned ${updated.count} account(s) to default profile "${profile.name}"`);
  }

  console.log("Migration complete!");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
