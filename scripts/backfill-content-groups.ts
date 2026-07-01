/**
 * One-off / on-demand: run cross-platform content grouping over each
 * profile's FULL post history. Idempotent — group ids are the earliest
 * member's post id, so re-runs converge.
 *
 * Usage (droplet, repo root):
 *   npx tsx scripts/backfill-content-groups.ts            # all profiles
 *   npx tsx scripts/backfill-content-groups.ts <profileId>
 */
import { PrismaClient } from "@prisma/client";
import { regroupProfileWindow } from "../lib/content-grouping";

const prisma = new PrismaClient();

async function main() {
  const only = process.argv[2];
  const profiles = await prisma.profile.findMany({
    where: only ? { id: only } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (profiles.length === 0) {
    console.error(only ? `No profile found for "${only}"` : "No profiles exist.");
    process.exit(1);
  }

  console.log(`Grouping content for ${profiles.length} profile(s)...`);
  for (const p of profiles) {
    const t0 = Date.now();
    const changed = await regroupProfileWindow(p.id); // full history
    const groups = await prisma.post.groupBy({
      by: ["contentGroupId"],
      where: { isDeleted: false, socialAccount: { profileId: p.id }, contentGroupId: { not: null } },
      _count: { _all: true },
    });
    const multi = groups.filter((g) => g._count._all >= 2).length;
    console.log(
      `  ${p.name}: ${changed} assignments written — ${groups.length} groups, ${multi} multi-post (${Math.round((Date.now() - t0) / 1000)}s)`
    );
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
