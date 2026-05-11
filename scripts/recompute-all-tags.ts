/**
 * One-off / on-demand: re-run the auto-tag engine over every active
 * SocialAccount that has `defaultTags` or `tagRules` configured.
 *
 * Useful when posts were ingested via a path that bypassed the
 * `/api/sync/ingest` auto-tag step — e.g. the Twitter archive
 * backfill before that script learned to call `recomputeAccountTags`.
 *
 * Usage:
 *   npx tsx scripts/recompute-all-tags.ts          # all accounts
 *   npx tsx scripts/recompute-all-tags.ts <id|handle>  # one account
 */
import { PrismaClient } from "@prisma/client";
import { recomputeAccountTags } from "../lib/tagging";

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];

  let accounts: Array<{ id: string; accountId: string; platform: string; defaultTags: string[]; tagRules: unknown }>;
  if (arg) {
    const single = await prisma.socialAccount.findFirst({
      where: {
        OR: [
          { id: arg },
          { accountId: arg },
        ],
      },
      select: { id: true, accountId: true, platform: true, defaultTags: true, tagRules: true },
    });
    if (!single) {
      console.error(`No account found for "${arg}"`);
      process.exit(1);
    }
    accounts = [single];
  } else {
    accounts = await prisma.socialAccount.findMany({
      where: { isActive: true },
      select: { id: true, accountId: true, platform: true, defaultTags: true, tagRules: true },
      orderBy: [{ platform: "asc" }, { accountId: "asc" }],
    });
  }

  console.log(`Recomputing tags for ${accounts.length} account(s)...`);
  let total = 0;
  for (const a of accounts) {
    const hasConfig =
      (a.defaultTags ?? []).length > 0 ||
      (Array.isArray(a.tagRules) && a.tagRules.length > 0);
    if (!hasConfig) {
      console.log(`  ${a.platform}/${a.accountId}: no defaultTags or tagRules, skipping`);
      continue;
    }
    try {
      const changed = await recomputeAccountTags(a.id);
      total += changed;
      console.log(`  ${a.platform}/${a.accountId}: ${changed} posts retagged`);
    } catch (err) {
      console.error(`  ${a.platform}/${a.accountId}: FAILED — ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\nDone. ${total} posts retagged in total.`);
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
