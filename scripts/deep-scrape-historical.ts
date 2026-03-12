/**
 * One-time deep historical scrape for Instagram and X/Twitter.
 * Raises the normal sync limits to fetch as many posts as possible.
 *
 * Usage:
 *   npx tsx scripts/deep-scrape-historical.ts <accountId>
 *   npx tsx scripts/deep-scrape-historical.ts --all-turkiye
 *
 * This runs the same collectors but with higher limits:
 *   - Instagram: up to 2000 posts (vs normal 200)
 *   - Twitter:   up to 500 posts with 100 scrolls (vs normal 100/20)
 */

import { PrismaClient, type SocialAccount } from "@prisma/client";
import { chromium, type Page, type Browser } from "playwright";
import {
  parseCookieData,
  loadCookiesIntoContext,
} from "@/lib/utils/browser-cookies";
import {
  fetchAllInstagramPosts,
  resolveInstagramUserId,
  fetchInstagramProfile,
} from "@/lib/utils/instagram-scraper";
import {
  extractMetricsFromGraphQL,
  extractMetricsFromPost,
  extractProfileStats,
  listenForProfileGraphQL,
  getRandomUserAgent,
} from "@/lib/utils/twitter-scraper";
import type { PostType, MetricType } from "@prisma/client";

const prisma = new PrismaClient();

// ============ CONFIG ============
const IG_MAX_POSTS = 2000;
const TWITTER_MAX_POSTS = 500;
const TWITTER_MAX_SCROLLS = 100;

// ============ INSTAGRAM DEEP SCRAPE ============

async function deepScrapeInstagram(account: SocialAccount) {
  console.log(`\n[IG] Deep scraping @${account.accountId}...`);

  const cookieData = parseCookieData(account.authToken!);
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });

    const loaded = await loadCookiesIntoContext(context, cookieData);
    console.log(`[IG] Loaded ${loaded} cookies`);

    const page = await context.newPage();
    await page.goto("https://www.instagram.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const username = account.accountId.replace(/^@/, "");
    const userId = await resolveInstagramUserId(page, username);
    console.log(`[IG] Resolved @${username} to userId ${userId}`);

    // Fetch with high limit
    const posts = await fetchAllInstagramPosts(page, userId, IG_MAX_POSTS);
    console.log(`[IG] Fetched ${posts.length} posts`);

    if (posts.length === 0) {
      console.log("[IG] No posts found, aborting");
      return;
    }

    const earliest = new Date(Math.min(...posts.map((p) => p.publishedAt)) * 1000);
    const latest = new Date(Math.max(...posts.map((p) => p.publishedAt)) * 1000);
    console.log(`[IG] Date range: ${earliest.toISOString().split("T")[0]} to ${latest.toISOString().split("T")[0]}`);

    // Fetch profile stats
    const profile = await fetchInstagramProfile(page, username);
    console.log(`[IG] Followers: ${profile.followers}`);

    // Upsert posts and metrics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let postsUpserted = 0;
    let metricsUpserted = 0;

    for (const post of posts) {
      const postType: PostType = post.isReel ? "video" : post.mediaType === "video" ? "video" : post.mediaType === "carousel" ? "carousel" : "image";

      // Sanitize caption — remove null bytes and broken escape sequences that PostgreSQL rejects
      const caption = post.caption?.replace(/\x00/g, "").replace(/\\x[0-9a-fA-F]{0,1}(?![0-9a-fA-F])/g, "") || null;
      const title = caption?.substring(0, 200) || null;

      try {
      const dbPost = await prisma.post.upsert({
        where: {
          socialAccountId_postId: {
            socialAccountId: account.id,
            postId: post.postId,
          },
        },
        update: {
          title,
          description: caption,
          thumbnailUrl: post.thumbnailUrl,
        },
        create: {
          socialAccountId: account.id,
          platform: "instagram",
          postId: post.postId,
          postType,
          title,
          description: caption,
          contentUrl: post.permalink,
          thumbnailUrl: post.thumbnailUrl,
          publishedAt: new Date(post.publishedAt * 1000),
        },
      });
      postsUpserted++;

      // Upsert metrics
      const metricEntries: { type: MetricType; value: number }[] = [
        { type: "likes", value: post.likeCount },
        { type: "comments", value: post.commentCount },
      ];
      if (post.playCount > 0) {
        metricEntries.push({ type: "views", value: post.playCount });
      }

      for (const m of metricEntries) {
        await prisma.postMetric.upsert({
          where: {
            postId_metricType_metricDate: {
              postId: dbPost.id,
              metricType: m.type,
              metricDate: today,
            },
          },
          update: { metricValue: BigInt(m.value) },
          create: {
            postId: dbPost.id,
            socialAccountId: account.id,
            platform: "instagram",
            metricType: m.type,
            metricDate: today,
            metricValue: BigInt(m.value),
          },
        });
        metricsUpserted++;
      }
      } catch (err) {
        console.log(`[IG] Skipping post ${post.postId}: ${err instanceof Error ? err.message.slice(0, 80) : err}`);
      }
    }

    // Upsert daily rollup with follower count
    await prisma.accountDailyRollup.upsert({
      where: {
        socialAccountId_rollupDate: {
          socialAccountId: account.id,
          rollupDate: today,
        },
      },
      update: { totalFollowers: BigInt(profile.followers) },
      create: {
        socialAccountId: account.id,
        platform: "instagram",
        rollupDate: today,
        totalFollowers: BigInt(profile.followers),
      },
    });

    // Update sync status
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { syncStatus: "success", lastSyncedAt: new Date() },
    });

    console.log(`[IG] Done: ${postsUpserted} posts, ${metricsUpserted} metrics upserted`);
  } finally {
    await browser.close();
  }
}

// ============ TWITTER DEEP SCRAPE ============

interface ScrapedTweet {
  postId: string;
  text: string;
  publishedAt: string;
  hasVideo: boolean;
  hasImage: boolean;
  permalink: string;
}

async function deepScrollTimeline(
  page: Page,
  username: string,
): Promise<ScrapedTweet[]> {
  const posts: ScrapedTweet[] = [];
  const seen = new Set<string>();
  let noNewPostsCount = 0;

  for (let scroll = 0; scroll < TWITTER_MAX_SCROLLS; scroll++) {
    const prevCount = posts.length;

    const tweetElements = await page.$$('article[data-testid="tweet"]');
    for (const tweet of tweetElements) {
      if (posts.length >= TWITTER_MAX_POSTS) break;
      try {
        const linkEl = await tweet.$('a[href*="/status/"]');
        if (!linkEl) continue;
        const href = await linkEl.getAttribute("href");
        if (!href) continue;
        const match = href.match(/\/status\/(\d+)/);
        if (!match) continue;
        const postId = match[1];
        if (seen.has(postId)) continue;
        seen.add(postId);

        const textEl = await tweet.$('[data-testid="tweetText"]');
        const text = textEl ? await textEl.innerText() : "";
        const timeEl = await tweet.$("time");
        const publishedAt = timeEl
          ? (await timeEl.getAttribute("datetime")) ?? new Date().toISOString()
          : new Date().toISOString();
        const hasVideo = !!(await tweet.$('[data-testid="videoPlayer"]'));
        const hasImage = !!(await tweet.$('[data-testid="tweetPhoto"]'));

        posts.push({
          postId,
          text,
          publishedAt,
          hasVideo,
          hasImage,
          permalink: `https://x.com/${username}/status/${postId}`,
        });
      } catch { /* skip */ }
    }

    if (posts.length >= TWITTER_MAX_POSTS) break;
    if (posts.length === prevCount) {
      noNewPostsCount++;
      if (noNewPostsCount >= 5) {
        console.log(`[X] Timeline exhausted after ${scroll} scrolls (${posts.length} posts)`);
        break;
      }
    } else {
      noNewPostsCount = 0;
      if (scroll % 10 === 0) {
        console.log(`[X] ... ${posts.length} posts after ${scroll} scrolls`);
      }
    }

    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(1500 + Math.random() * 1000);
  }

  return posts;
}

async function deepScrapeTwitter(account: SocialAccount) {
  console.log(`\n[X] Deep scraping @${account.accountId}...`);

  const username = account.accountId.replace(/^@/, "");
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent: getRandomUserAgent(),
      viewport: { width: 1280, height: 800 },
    });

    if (account.authToken) {
      const cookieData = parseCookieData(account.authToken);
      const loaded = await loadCookiesIntoContext(context, cookieData);
      console.log(`[X] Loaded ${loaded} cookies`);
    }

    const page = await context.newPage();

    // Set up GraphQL listener for profile stats
    const profilePromise = listenForProfileGraphQL(page);

    await page.goto(`https://x.com/${username}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    // Check for profile stats
    const graphQLProfile = await Promise.race([
      profilePromise,
      new Promise<null>((r) => setTimeout(() => r(null), 3000)),
    ]);

    let followers = 0;
    if (graphQLProfile && graphQLProfile.followers > 0) {
      followers = graphQLProfile.followers;
      console.log(`[X] Followers: ${followers}`);
    } else {
      const domProfile = await extractProfileStats(page);
      if (domProfile) {
        followers = domProfile.followers;
        console.log(`[X] Followers (DOM): ${followers}`);
      }
    }

    // Deep scroll timeline
    console.log(`[X] Scrolling timeline (max ${TWITTER_MAX_SCROLLS} scrolls, ${TWITTER_MAX_POSTS} posts)...`);
    const tweets = await deepScrollTimeline(page, username);
    console.log(`[X] Scraped ${tweets.length} posts from timeline`);

    if (tweets.length === 0) {
      console.log("[X] No posts found, aborting");
      return;
    }

    const earliest = tweets.reduce((min, t) => t.publishedAt < min ? t.publishedAt : min, tweets[0].publishedAt);
    const latest = tweets.reduce((max, t) => t.publishedAt > max ? t.publishedAt : max, tweets[0].publishedAt);
    console.log(`[X] Date range: ${earliest.split("T")[0]} to ${latest.split("T")[0]}`);

    // Upsert posts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let postsUpserted = 0;

    for (const tweet of tweets) {
      const postType: PostType = tweet.hasVideo ? "video" : tweet.hasImage ? "image" : "text";
      await prisma.post.upsert({
        where: {
          socialAccountId_postId: {
            socialAccountId: account.id,
            postId: tweet.postId,
          },
        },
        update: {
          title: tweet.text.substring(0, 200) || null,
          description: tweet.text || null,
        },
        create: {
          socialAccountId: account.id,
          platform: "twitter",
          postId: tweet.postId,
          postType,
          title: tweet.text.substring(0, 200) || null,
          description: tweet.text || null,
          contentUrl: tweet.permalink,
          thumbnailUrl: null,
          publishedAt: new Date(tweet.publishedAt),
        },
      });
      postsUpserted++;
    }

    console.log(`[X] Upserted ${postsUpserted} posts. Now scraping metrics...`);

    // Scrape metrics for all posts (new browser context for cookies)
    const metricContext = await browser.newContext({
      userAgent: getRandomUserAgent(),
      viewport: { width: 1280, height: 800 },
    });
    if (account.authToken) {
      const cookieData = parseCookieData(account.authToken);
      await loadCookiesIntoContext(metricContext, cookieData);
    }
    const metricPage = await metricContext.newPage();

    let metricsUpserted = 0;
    let failures = 0;

    // Get all post DB IDs for this account
    const dbPosts = await prisma.post.findMany({
      where: { socialAccountId: account.id },
      select: { id: true, postId: true },
    });
    const postIdMap = new Map(dbPosts.map((p) => [p.postId, p.id]));

    for (let i = 0; i < tweets.length; i++) {
      const tweet = tweets[i];
      const dbPostId = postIdMap.get(tweet.postId);
      if (!dbPostId) continue;

      try {
        const postUrl = `https://x.com/${username}/status/${tweet.postId}`;
        let scraped = await extractMetricsFromGraphQL(metricPage, postUrl);

        if (scraped.views === undefined && scraped.likes === undefined && scraped.retweets === undefined) {
          scraped = await extractMetricsFromPost(metricPage, postUrl);
        }

        const entries: { type: MetricType; value: number }[] = [];
        if (scraped.views !== undefined) entries.push({ type: "views", value: scraped.views });
        if (scraped.likes !== undefined) entries.push({ type: "likes", value: scraped.likes });
        if (scraped.retweets !== undefined) entries.push({ type: "shares", value: scraped.retweets });
        if (scraped.replies !== undefined) entries.push({ type: "comments", value: scraped.replies });
        if (scraped.bookmarks !== undefined) entries.push({ type: "bookmarks", value: scraped.bookmarks });

        for (const m of entries) {
          await prisma.postMetric.upsert({
            where: {
              postId_metricType_metricDate: {
                postId: dbPostId,
                metricType: m.type,
                metricDate: today,
              },
            },
            update: { metricValue: BigInt(m.value) },
            create: {
              postId: dbPostId,
              socialAccountId: account.id,
              platform: "twitter",
              metricType: m.type,
              metricDate: today,
              metricValue: BigInt(m.value),
            },
          });
          metricsUpserted++;
        }

        if ((i + 1) % 20 === 0) {
          console.log(`[X] ... ${i + 1}/${tweets.length} posts scraped (${metricsUpserted} metrics)`);
        }

        await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000));
      } catch (err) {
        failures++;
        console.log(`[X] Failed metrics for ${tweet.postId}: ${err instanceof Error ? err.message : err}`);
        if (failures > 15) {
          console.log(`[X] Too many failures, stopping metric scraping`);
          break;
        }
      }
    }

    // Upsert follower rollup
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

    // Update sync status
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { syncStatus: "success", lastSyncedAt: new Date() },
    });

    console.log(`[X] Done: ${postsUpserted} posts, ${metricsUpserted} metrics (${failures} failures)`);
  } finally {
    await browser.close();
  }
}

// ============ MAIN ============

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.log("Usage:");
    console.log("  npx tsx scripts/deep-scrape-historical.ts <accountId>");
    console.log("  npx tsx scripts/deep-scrape-historical.ts --all-turkiye");
    process.exit(1);
  }

  let accounts: SocialAccount[];

  if (arg === "--all-turkiye") {
    accounts = await prisma.socialAccount.findMany({
      where: {
        OR: [
          { accountName: { contains: "rkiye" } },
          { accountName: { contains: "rkiy" } },
        ],
        platform: { in: ["instagram", "twitter"] },
        isActive: true,
      },
    });
  } else {
    const account = await prisma.socialAccount.findUnique({ where: { id: arg } });
    if (!account) {
      console.error(`Account ${arg} not found`);
      process.exit(1);
    }
    accounts = [account];
  }

  console.log(`Found ${accounts.length} account(s) to deep scrape:`);
  for (const a of accounts) {
    console.log(`  - ${a.platform}: ${a.accountName} (@${a.accountId})`);
  }

  for (const account of accounts) {
    try {
      if (account.platform === "instagram") {
        await deepScrapeInstagram(account);
      } else if (account.platform === "twitter") {
        await deepScrapeTwitter(account);
      } else {
        console.log(`Skipping ${account.platform} — not supported for deep scrape`);
      }
    } catch (err) {
      console.error(`Failed to deep scrape ${account.accountName}:`, err);
    }
  }

  console.log("\nDone!");
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
