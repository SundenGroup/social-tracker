/**
 * Import specific tweets by ID for a given account.
 * Visits each tweet page via Playwright, scrapes metadata + metrics, and upserts into DB.
 *
 * Usage:
 *   npx tsx scripts/import-tweets-by-id.ts <accountId> <tweetId1> <tweetId2> ...
 */

import { PrismaClient, type MetricType, type PostType } from "@prisma/client";
import { chromium } from "playwright";
import {
  parseCookieData,
  loadCookiesIntoContext,
} from "@/lib/utils/browser-cookies";
import {
  extractMetricsFromGraphQL,
  extractMetricsFromPost,
  getRandomUserAgent,
} from "@/lib/utils/twitter-scraper";

const prisma = new PrismaClient();

async function main() {
  const [accountId, ...tweetIds] = process.argv.slice(2);

  if (!accountId || tweetIds.length === 0) {
    console.error("Usage: npx tsx scripts/import-tweets-by-id.ts <accountId> <tweetId1> <tweetId2> ...");
    process.exit(1);
  }

  const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    console.error(`Account ${accountId} not found`);
    process.exit(1);
  }

  const username = account.accountId;
  console.log(`Importing ${tweetIds.length} tweets for @${username} (${account.accountName})\n`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const browser = await chromium.launch({ headless: true });

  try {
    const contextOptions: Record<string, unknown> = {
      userAgent: getRandomUserAgent(),
      viewport: { width: 1280, height: 800 },
    };

    const context = await browser.newContext(contextOptions);

    // Load cookies if available
    const cookieData = account.authToken ? parseCookieData(account.authToken) : null;
    if (cookieData) {
      await loadCookiesIntoContext(context, cookieData);
      console.log("[auth] Loaded cookies\n");
    }

    const page = await context.newPage();

    for (let i = 0; i < tweetIds.length; i++) {
      const tweetId = tweetIds[i];
      const postUrl = `https://x.com/${username}/status/${tweetId}`;
      console.log(`[${i + 1}/${tweetIds.length}] Scraping ${postUrl}`);

      try {
        // Navigate to tweet page
        await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(3000);

        // Extract published date from the tweet page
        const timeEl = await page.$('article time[datetime]');
        let publishedAt: Date | null = null;
        if (timeEl) {
          const datetime = await timeEl.getAttribute("datetime");
          if (datetime) publishedAt = new Date(datetime);
        }

        if (!publishedAt) {
          console.log(`  ⚠ Could not extract publish date, skipping`);
          continue;
        }

        // Detect post type
        const hasVideo = await page.$('article video, article [data-testid="videoPlayer"]');
        const hasImage = await page.$('article [data-testid="tweetPhoto"]');
        let postType: PostType = "text";
        if (hasVideo) postType = "video";
        else if (hasImage) postType = "image";

        // Extract tweet text
        const textEl = await page.$('article [data-testid="tweetText"]');
        const text = textEl ? (await textEl.textContent()) ?? "" : "";
        const title = text.slice(0, 200);

        // Extract metrics
        let scraped = await extractMetricsFromGraphQL(page, postUrl);
        if (scraped.views === undefined && scraped.likes === undefined) {
          scraped = await extractMetricsFromPost(page, postUrl);
        }

        // Upsert post
        const dbPost = await prisma.post.upsert({
          where: {
            socialAccountId_postId: {
              socialAccountId: account.id,
              postId: tweetId,
            },
          },
          update: {
            title,
            description: text,
            postType,
            publishedAt,
          },
          create: {
            socialAccountId: account.id,
            platform: "twitter",
            postId: tweetId,
            title,
            description: text,
            contentUrl: postUrl,
            postType,
            publishedAt,
          },
        });

        console.log(`  ✓ Post saved: ${publishedAt.toISOString().split("T")[0]} | ${postType} | "${title.slice(0, 60)}..."`);

        // Upsert metrics
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
                postId: dbPost.id,
                metricType: m.type,
                metricDate: today,
              },
            },
            update: { metricValue: BigInt(m.value) },
            create: {
              postId: dbPost.id,
              socialAccountId: account.id,
              platform: "twitter",
              metricType: m.type,
              metricDate: today,
              metricValue: BigInt(m.value),
            },
          });
        }

        console.log(`  ✓ Metrics: views=${scraped.views ?? "?"} likes=${scraped.likes ?? "?"} retweets=${scraped.retweets ?? "?"} replies=${scraped.replies ?? "?"}`);

        // Delay between tweets
        if (i < tweetIds.length - 1) {
          await page.waitForTimeout(3000 + Math.random() * 2000);
        }
      } catch (err) {
        console.log(`  ✗ Failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    await context.close();
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  console.log("\nDone!");
}

main().catch(console.error);
