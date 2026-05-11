/**
 * Full-archive backfill for a single Twitter/X account via the
 * `/2/tweets/search/all` endpoint.
 *
 * The `users/:id/tweets` endpoint used by `twitter-historical-backfill.ts`
 * has an undocumented ~8-month lookback cap on Basic-tier API access — even
 * with explicit start_time/end_time parameters, it returns 0 results for
 * older windows. The full-archive search endpoint (Basic tier and above)
 * has no such cap and goes back to Twitter's beginning.
 *
 * Usage:
 *   TWITTER_BEARER_TOKEN=... npx tsx scripts/twitter-archive-backfill.ts \
 *     <accountDbId | @handle> [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *
 * --from defaults to 2010-01-01 (well before any modern account exists).
 * --to defaults to now. Both are inclusive.
 *
 * Examples:
 *   npx tsx scripts/twitter-archive-backfill.ts PUBGEsportsWest --from 2025-01-01
 *   npx tsx scripts/twitter-archive-backfill.ts cmocrn7as01950c19aqkvcfk5
 *
 * Note: Full-archive search has stricter rate limits than the user
 * timeline endpoint. The script paces itself accordingly and retries on 429.
 */
import { PrismaClient, type PostType, type SocialAccount } from "@prisma/client";
import { recomputeAccountTags } from "../lib/tagging";

const prisma = new PrismaClient();

const PAGE_SIZE = 100; // Search/all maximum
const REQUEST_DELAY_MS = 1500;

interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    bookmark_count?: number;
    impression_count?: number;
  };
  attachments?: { media_keys?: string[] };
}

interface XMedia {
  media_key: string;
  type: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
}

const bearer = process.env.TWITTER_BEARER_TOKEN;
if (!bearer) {
  console.error("Missing TWITTER_BEARER_TOKEN — aborting.");
  process.exit(1);
}

async function xFetch<T>(url: string, retries = 3): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
  });

  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get("retry-after") || "60");
    const waitMs = Math.min(retryAfter, 300) * 1000 + Math.random() * 2000;
    console.log(`  Rate limited (429). Waiting ${Math.round(waitMs / 1000)}s...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return xFetch<T>(url, retries - 1);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

function sanitize(text: string): string {
  // Strip bytes Postgres rejects + malformed JSON escapes + orphan UTF-16
  // surrogates. Same logic as the timeline-based backfill.
  const roundtripped = Buffer.from(text, "utf8").toString("utf8");
  return roundtripped
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\\x[0-9a-fA-F]{0,1}(?![0-9a-fA-F])/g, "")
    .replace(/\\u[0-9a-fA-F]{0,3}(?![0-9a-fA-F])/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .normalize("NFC");
}

function dumpBytes(s: string, maxChars = 50): string {
  const slice = s.slice(0, maxChars);
  return Array.from(slice)
    .map((c) => {
      const cp = c.codePointAt(0)!;
      if (cp < 0x20 || cp >= 0x7f) return `\\u{${cp.toString(16)}}`;
      return c;
    })
    .join("");
}

async function resolveAccount(arg: string): Promise<SocialAccount> {
  const byId = await prisma.socialAccount.findUnique({ where: { id: arg } });
  if (byId) return byId;

  const handle = arg.replace(/^@/, "");
  const byHandle = await prisma.socialAccount.findFirst({
    where: { platform: "twitter", accountId: handle },
  });
  if (byHandle) return byHandle;

  throw new Error(`No Twitter SocialAccount found for "${arg}"`);
}

function parseArgs(): { account: string; from: string; to: string } {
  const args = process.argv.slice(2);
  let account: string | null = null;
  let from = "2010-01-01T00:00:00Z";
  let to = new Date(Date.now() - 30_000).toISOString(); // 30s buffer; search/all rejects "future" timestamps

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--from") {
      const d = args[++i];
      from = d.includes("T") ? d : `${d}T00:00:00Z`;
    } else if (a === "--to") {
      const d = args[++i];
      to = d.includes("T") ? d : `${d}T23:59:59Z`;
    } else if (!account) {
      account = a;
    }
  }

  if (!account) {
    console.error("Usage: npx tsx scripts/twitter-archive-backfill.ts <accountDbId | @handle> [--from YYYY-MM-DD] [--to YYYY-MM-DD]");
    process.exit(1);
  }

  return { account, from, to };
}

async function main() {
  const { account: arg, from, to } = parseArgs();

  const account = await resolveAccount(arg);
  const username = account.accountId.replace(/^@/, "");
  console.log(`Archive backfill Twitter @${username} (${account.accountName}, id=${account.id})`);
  console.log(`  Window: ${from}  →  ${to}`);

  // Resolve follower count for the rollup at the end
  const userRes = await xFetch<{
    data: {
      id: string;
      public_metrics: { followers_count: number; following_count: number; tweet_count: number };
    };
  }>(`https://api.x.com/2/users/by/username/${username}?user.fields=public_metrics`);
  const followers = userRes.data.public_metrics.followers_count;
  const lifetime = userRes.data.public_metrics.tweet_count;
  console.log(`  Resolved → followers=${followers.toLocaleString()}, lifetime tweets=${lifetime.toLocaleString()}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let fetched = 0;
  let postsUpserted = 0;
  let metricsUpserted = 0;
  let nextToken: string | undefined;
  let page = 0;

  const earliest = { date: new Date(), id: "" };
  const latest = { date: new Date(0), id: "" };

  while (true) {
    page++;
    const params = new URLSearchParams({
      query: `from:${username} -is:retweet -is:reply`,
      max_results: String(PAGE_SIZE),
      "tweet.fields": "created_at,public_metrics,attachments",
      "media.fields": "type,url,preview_image_url",
      expansions: "attachments.media_keys",
      start_time: from,
      end_time: to,
    });
    if (nextToken) params.set("next_token", nextToken);

    const res = await xFetch<{
      data?: XTweet[];
      includes?: { media?: XMedia[] };
      meta: { result_count: number; next_token?: string };
    }>(`https://api.x.com/2/tweets/search/all?${params}`);

    const batch = res.data ?? [];
    console.log(`  [page ${page}] ${batch.length} tweets (cumulative ${fetched + batch.length})`);

    if (batch.length === 0 && !res.meta.next_token) {
      console.log("  No results in window — stopping.");
      break;
    }

    const mediaMap = new Map<string, XMedia>();
    for (const m of res.includes?.media ?? []) mediaMap.set(m.media_key, m);

    for (const tweet of batch) {
      const mediaKeys = tweet.attachments?.media_keys ?? [];
      const items = mediaKeys.map((k) => mediaMap.get(k)).filter(Boolean) as XMedia[];
      const hasVideo = items.some((m) => m.type === "video" || m.type === "animated_gif");
      const hasImage = items.some((m) => m.type === "photo");
      const postType: PostType = hasVideo ? "video" : hasImage ? "image" : "text";
      const thumb = items[0]?.preview_image_url ?? items[0]?.url ?? null;
      const publishedAt = new Date(tweet.created_at ?? Date.now());
      const title = sanitize(tweet.text).substring(0, 200) || null;
      const description = sanitize(tweet.text) || null;

      let dbPost;
      try {
        dbPost = await prisma.post.upsert({
          where: {
            socialAccountId_postId: {
              socialAccountId: account.id,
              postId: tweet.id,
            },
          },
          update: { title, description },
          create: {
            socialAccountId: account.id,
            platform: "twitter",
            postId: tweet.id,
            postType,
            title,
            description,
            contentUrl: `https://x.com/${username}/status/${tweet.id}`,
            thumbnailUrl: thumb,
            publishedAt,
          },
        });
      } catch (err) {
        console.log(`  ! tweet ${tweet.id} upsert failed: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
        console.log(`    text preview: ${dumpBytes(tweet.text, 120)}`);
        try {
          dbPost = await prisma.post.upsert({
            where: {
              socialAccountId_postId: {
                socialAccountId: account.id,
                postId: tweet.id,
              },
            },
            update: { title: null, description: null },
            create: {
              socialAccountId: account.id,
              platform: "twitter",
              postId: tweet.id,
              postType,
              title: null,
              description: null,
              contentUrl: `https://x.com/${username}/status/${tweet.id}`,
              thumbnailUrl: thumb,
              publishedAt,
            },
          });
          console.log(`    recovered by dropping text`);
        } catch (err2) {
          console.log(`    retry also failed, skipping: ${err2 instanceof Error ? err2.message.split("\n")[0] : err2}`);
          continue;
        }
      }
      postsUpserted++;

      if (publishedAt < earliest.date) { earliest.date = publishedAt; earliest.id = tweet.id; }
      if (publishedAt > latest.date) { latest.date = publishedAt; latest.id = tweet.id; }

      const pm = tweet.public_metrics;
      if (pm) {
        const entries: Array<{ type: "likes" | "shares" | "comments" | "bookmarks" | "views"; value: number }> = [
          { type: "likes", value: pm.like_count },
          { type: "shares", value: pm.retweet_count + (pm.quote_count ?? 0) },
          { type: "comments", value: pm.reply_count },
        ];
        if (pm.bookmark_count != null) entries.push({ type: "bookmarks", value: pm.bookmark_count });
        if (pm.impression_count != null) entries.push({ type: "views", value: pm.impression_count });

        for (const m of entries) {
          await prisma.postMetric.upsert({
            where: {
              postId_metricType_metricDate: {
                postId: dbPost.id,
                metricType: m.type as never,
                metricDate: today,
              },
            },
            update: { metricValue: BigInt(m.value) },
            create: {
              postId: dbPost.id,
              socialAccountId: account.id,
              platform: "twitter",
              metricType: m.type as never,
              metricDate: today,
              metricValue: BigInt(m.value),
            },
          });
          metricsUpserted++;
        }
      }
    }

    fetched += batch.length;
    nextToken = res.meta.next_token;
    if (!nextToken) {
      console.log("  No next_token — search exhausted for window.");
      break;
    }

    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  if (followers > 0) {
    await prisma.accountDailyRollup.upsert({
      where: {
        socialAccountId_rollupDate: {
          socialAccountId: account.id,
          rollupDate: today,
        },
      },
      update: { totalFollowers: BigInt(followers) },
      create: {
        socialAccountId: account.id,
        platform: "twitter",
        rollupDate: today,
        totalFollowers: BigInt(followers),
      },
    });
  }

  await prisma.socialAccount.update({
    where: { id: account.id },
    data: { syncStatus: "success", lastSyncedAt: new Date() },
  });

  // Re-run the auto-tag engine over the account's posts now that
  // backfill is finished. The per-post upserts above write `tags`
  // straight to Prisma (no /api/sync/ingest call), so otherwise the
  // freshly-inserted historical posts would have empty `tags`
  // arrays and miss any defaultTags / tagRules the account has
  // configured. Cheap to run — the helper short-circuits unchanged
  // rows.
  let retagged = 0;
  try {
    retagged = await recomputeAccountTags(account.id);
  } catch (err) {
    console.error(
      `[Archive] recomputeAccountTags failed for @${username}: ${err instanceof Error ? err.message : err}`
    );
  }

  console.log(`\nDone.`);
  console.log(`  Fetched:         ${fetched} tweets`);
  console.log(`  Posts upserted:  ${postsUpserted}`);
  console.log(`  Metrics upserted:${metricsUpserted}`);
  console.log(`  Posts retagged:  ${retagged}`);
  if (earliest.id) console.log(`  Earliest:        ${earliest.date.toISOString().split("T")[0]} (id ${earliest.id})`);
  if (latest.id) console.log(`  Latest:          ${latest.date.toISOString().split("T")[0]} (id ${latest.id})`);
  console.log(`  Followers:       ${followers.toLocaleString()}`);
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
