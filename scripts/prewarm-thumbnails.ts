/**
 * Pre-warm the thumbnail cache on the DROPLET.
 *
 * TikTok / Twitter / YouTube thumbnail URLs are fetchable from the
 * datacenter IP, so we can proactively download + persist permanent
 * copies BEFORE the signed URLs expire — instead of waiting for a
 * dashboard view to lazily cache each one. Instagram is skipped (the
 * CDN 403s the droplet; use scripts/backfill-ig-thumbnails.ts on the
 * Mac for those).
 *
 * Idempotent: skips posts already cached on disk.
 *
 * Usage (on the droplet):
 *   npx tsx scripts/prewarm-thumbnails.ts [tiktok|twitter|youtube] [limit]
 *   npx tsx scripts/prewarm-thumbnails.ts            # tiktok, all
 */
import { PrismaClient } from "@prisma/client";
import { readCached, fetchAndCache } from "../lib/thumbnails";

const prisma = new PrismaClient();

async function main() {
  const platform = (process.argv[2] || "tiktok") as never;
  const limit = process.argv[3] ? Number(process.argv[3]) : Infinity;

  const posts = await prisma.post.findMany({
    where: { platform, isDeleted: false, thumbnailUrl: { not: null } },
    select: { id: true, postId: true, platform: true, thumbnailUrl: true },
    orderBy: { publishedAt: "desc" },
  });

  console.log(`[Prewarm] ${posts.length} ${platform} posts with a thumbnail URL.`);

  let cached = 0;
  let already = 0;
  let failed = 0;
  let processed = 0;

  for (const p of posts) {
    if (processed >= limit) break;
    processed++;

    if (await readCached(p.id)) {
      already++;
      continue;
    }

    let source = p.thumbnailUrl as string | null;
    if (!source && p.platform === "youtube" && p.postId) {
      source = `https://i.ytimg.com/vi/${p.postId}/hqdefault.jpg`;
    }
    if (!source) {
      failed++;
      continue;
    }

    const bytes = await fetchAndCache(p.id, source);
    if (bytes) cached++;
    else failed++;

    if (processed % 100 === 0) {
      console.log(`[Prewarm] ${processed}/${posts.length} — cached ${cached}, skip ${already}, failed ${failed}`);
    }
  }

  console.log(`\n[Prewarm] Done. cached ${cached}, already-cached ${already}, failed ${failed} (of ${processed}).`);
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
