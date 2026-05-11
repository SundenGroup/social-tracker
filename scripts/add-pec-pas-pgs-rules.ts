/**
 * One-off: add the PEC / PAS / PGS auto-tag rules (copied from the
 * Global Twitter account) to every active SocialAccount under the
 * Türkiye, CIS, and Brasil profiles. Skips Korea per the user's
 * request, and never touches `defaultTags` — only `tagRules`.
 *
 * Idempotent: if a rule with the same `tag` already exists on an
 * account, it's left alone (we don't merge hashtags/keywords).
 *
 * Calls recomputeAccountTags after each update so historical posts
 * pick up the new rules immediately.
 */
import { PrismaClient } from "@prisma/client";
import { recomputeAccountTags, parseTagRules, type TagRule } from "../lib/tagging";

const prisma = new PrismaClient();

const PROFILE_NAMES = ["PUBG Türkiye", "PUBG CIS", "PUBG Esports Brasil"];

const NEW_RULES: TagRule[] = [
  {
    tag: "pec",
    displayTag: "PEC",
    hashtags: ["pec"],
    keywords: ["pec", "emea"],
    mentions: [],
    alwaysOn: false,
  },
  {
    tag: "pas",
    displayTag: "PAS",
    hashtags: ["pas", "pas1", "pas2"],
    keywords: ["pas", "pas1", "pas2", "americas"],
    mentions: [],
    alwaysOn: false,
  },
  {
    tag: "pgs",
    displayTag: "PGS",
    hashtags: [
      "pgs", "pgs1", "pgs2", "pgs3", "pgs4", "pgs5",
      "pgs6", "pgs7", "pgs8", "pgs9", "pgs10", "pgs11", "pgs12",
    ],
    keywords: ["pgs", "pubg", "global", "series"],
    mentions: [],
    alwaysOn: false,
  },
];

async function main() {
  const profiles = await prisma.profile.findMany({
    where: { name: { in: PROFILE_NAMES } },
    select: { id: true, name: true },
  });
  console.log(`Resolved ${profiles.length}/${PROFILE_NAMES.length} target profiles:`);
  for (const p of profiles) console.log(`  - ${p.name} (${p.id})`);
  if (profiles.length === 0) {
    console.error("No matching profiles — aborting.");
    process.exit(1);
  }

  const accounts = await prisma.socialAccount.findMany({
    where: {
      isActive: true,
      profileId: { in: profiles.map((p) => p.id) },
    },
    select: { id: true, platform: true, accountId: true, tagRules: true, profileId: true },
    orderBy: [{ profileId: "asc" }, { platform: "asc" }, { accountId: "asc" }],
  });
  console.log(`\nTouching ${accounts.length} accounts.`);

  let totalRetagged = 0;
  for (const a of accounts) {
    const profile = profiles.find((p) => p.id === a.profileId);
    const label = `${profile?.name ?? "?"} / ${a.platform}/${a.accountId}`;

    // Parse existing rules (idempotent — keep whatever's there).
    let existing: TagRule[] = [];
    try {
      existing = a.tagRules ? parseTagRules(a.tagRules) : [];
    } catch (err) {
      console.error(`  ${label}: existing rules failed to parse — skipping. ${err}`);
      continue;
    }

    const existingTags = new Set(existing.map((r) => r.tag));
    const toAdd = NEW_RULES.filter((r) => !existingTags.has(r.tag));
    if (toAdd.length === 0) {
      console.log(`  ${label}: already has all 3 rules, skipping.`);
      continue;
    }

    const merged: TagRule[] = [...existing, ...toAdd];
    await prisma.socialAccount.update({
      where: { id: a.id },
      data: { tagRules: merged as unknown as object[] },
    });
    console.log(`  ${label}: added ${toAdd.map((r) => r.tag).join(", ")} (${existing.length} → ${merged.length} rules)`);

    try {
      const changed = await recomputeAccountTags(a.id);
      totalRetagged += changed;
      console.log(`    retagged ${changed} historical posts`);
    } catch (err) {
      console.error(`    recompute failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone. ${totalRetagged} posts retagged across ${accounts.length} accounts.`);
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
