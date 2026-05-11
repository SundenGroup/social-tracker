/**
 * One-time historical backfill for a single Twitter/X account via the X API.
 *
 * The normal collector caps at 50 recent tweets. This script paginates the
 * `/users/:id/tweets` endpoint up to X's hard limit of ~3,200 tweets and
 * upserts every post + today's metric snapshot + follower rollup.
 *
 * Use when you just added a new Twitter SocialAccount and want loads of
 * historical data, but there are no session cookies (authToken) on the
 * account for the Playwright-based `deep-scrape-historical.ts`.
 *
 * Usage:
 *   TWITTER_BEARER_TOKEN=... npx tsx scripts/twitter-historical-backfill.ts <accountDbId | @handle>
 *
 * Examples:
 *   npx tsx scripts/twitter-historical-backfill.ts cmocrn7as01950c19aqkvcfk5
 *   npx tsx scripts/twitter-historical-backfill.ts PUBGEsports_KR
 */
import { PrismaClient, type PostType, type SocialAccount } from "@prisma/client";
import { recomputeAccountTags } from "../lib/tagging";

const prisma = new PrismaClient();

const PAGE_SIZE = 100; // X API maximum per request
const HARD_CAP = 3200; // X's own cap on user-timeline pagination
const REQUEST_DELAY_MS = 1500; // Be polite — avoid rate limits

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
  // surrogates (which show up when tweet text contains half of an emoji
  // pair). Without this, Prisma throws "unexpected end of hex escape".
  // Round-trip through Buffer to coerce any invalid UTF-8 to U+FFFD.
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
  // Try DB id first, fall back to platform+accountId lookup
  const byId = await prisma.socialAccount.findUnique({ where: { id: arg } });
  if (byId) return byId;

  const handle = arg.replace(/^@/, "");
  const byHandle = await prisma.socialAccount.findFirst({
    where: { platform: "twitter", accountId: handle },
  });
  if (byHandle) return byHandle;

  throw new Error(`No Twitter SocialAccount found for "${arg}"`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npx tsx scripts/twitter-historical-backfill.ts <accountDbId | @handle>");
    process.exit(1);
  }

  const account = await resolveAccount(arg);
  const username = account.accountId.replace(/^@/, "");
  console.log(`Backfilling Twitter @${username} (${account.accountName}, id=${account.id})`);

  // Step 1: resolve username → user ID + follower count
  const userRes = await xFetch<{
    data: {
      id: string;
      public_metrics: { followers_count: number; following_count: number; tweet_count: number };
    };
  }>(`https://api.x.com/2/users/by/username/${username}?user.fields=public_metrics`);
  const userId = userRes.data.id;
  const followers = userRes.data.public_metrics.followers_count;
  const totalTweets = userRes.data.public_metrics.tweet_count;
  console.log(`  Resolved → userId=${userId}, followers=${followers.toLocaleString()}, lifetime tweets=${totalTweets.toLocaleString()}`);

  // Step 2: paginate timeline
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let fetched = 0;
  let postsUpserted = 0;
  let metricsUpserted = 0;
  let nextToken: string | undefined;
  let page = 0;

  const earliest = { date: new Date(), id: "" };
  const latest = { date: new Date(0), id: "" };

  while (fetched < HARD_CAP) {
    page++;
    const params = new URLSearchParams({
      max_results: String(PAGE_SIZE),
      "tweet.fields": "created_at,public_metrics,attachments",
      "media.fields": "type,url,preview_image_url",
      expansions: "attachments.media_keys",
      exclude: "retweets,replies",
    });
    if (nextToken) params.set("pagination_token", nextToken);

    const res = await xFetch<{
      data?: XTweet[];
      includes?: { media?: XMedia[] };
      meta: { result_count: number; next_token?: string };
    }>(`https://api.x.com/2/users/${userId}/tweets?${params}`);

    const batch = res.data ?? [];
    console.log(`  [page ${page}] ${batch.length} tweets (cumulative ${fetched + batch.length})`);

    if (batch.length === 0) {
      console.log("  No more tweets returned — stopping.");
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
        // Retry with text nulled out — lets us still save the post row
        // + metrics even if the text is unserialiszable.
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

      // Metrics from public_metrics (included with every tweet)
      const pm = tweet.public_metrics;
      if (pm) {
        const entries: Array<{ type: "likes" | "shares" | "comments" | "bookmarks" | "views" | "quotes"; value: number }> = [
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
                metricType: m.type as never, // cast — enum set includes these
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
      console.log("  No next_token — timeline exhausted.");
      break;
    }
    if (fetched >= HARD_CAP) {
      console.log(`  Reached hard cap (${HARD_CAP}).`);
      break;
    }

    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  // Step 3: follower rollup
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

  // Re-run the auto-tag engine on this account's posts. Per-post
  // upserts above write `tags` straight to Prisma without going
  // through /api/sync/ingest, so otherwise the freshly-inserted
  // historical posts would miss the account's defaultTags + rule
  // tags. Cheap — the helper skips unchanged rows.
  let retagged = 0;
  try {
    retagged = await recomputeAccountTags(account.id);
  } catch (err) {
    console.error(
      `[Backfill] recomputeAccountTags failed for @${username}: ${err instanceof Error ? err.message : err}`
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
