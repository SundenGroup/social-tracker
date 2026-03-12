import { chromium, type Browser, type Page } from "playwright";
import {
  BaseCollector,
  type PostData,
  type MetricData,
  type AccountStats,
} from "./base-collector";
import {
  extractPostsFromTimeline,
  extractMetricsFromGraphQL,
  extractMetricsFromPost,
  extractProfileStats,
  listenForProfileGraphQL,
  getRandomUserAgent,
} from "@/lib/utils/twitter-scraper";
import {
  parseCookieData,
  loadCookiesIntoContext,
  validateCookiesForPlatform,
  areCookiesExpired,
} from "@/lib/utils/browser-cookies";
import type { SocialAccount } from "@prisma/client";

const MAX_POSTS_PER_SYNC = 100;
const PAGE_LOAD_DELAY = 3000; // 3s between page loads

export class TwitterCollector extends BaseCollector {
  private username: string;
  private hasCookies: boolean;
  private cachedProfileStats: { followers: number; following?: number } | null =
    null;

  constructor(account: SocialAccount) {
    super(account);
    // accountId is the handle (e.g., "PUBGEsports")
    this.username = account.accountId.replace(/^@/, "");
    this.hasCookies = !!account.authToken;
  }

  private async withBrowser<T>(
    fn: (page: Page, browser: Browser) => Promise<T>
  ): Promise<T> {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport: { width: 1280, height: 800 },
      });

      // Load session cookies if available
      if (this.hasCookies) {
        try {
          const cookieData = parseCookieData(this.account.authToken!);

          const validation = validateCookiesForPlatform(cookieData, "twitter");
          if (!validation.valid) {
            this.logger(
              `Warning: X cookies missing: ${validation.missing.join(", ")}. Scraping may fail.`
            );
          } else if (areCookiesExpired(cookieData, "twitter")) {
            this.logger(
              "Warning: X session cookies have expired. Scraping may fail."
            );
          } else {
            const loaded = await loadCookiesIntoContext(context, cookieData);
            this.logger(`Loaded ${loaded} cookies into browser context`);
          }
        } catch (err) {
          this.logger(`Warning: Failed to load X cookies: ${err}`);
        }
      } else {
        this.logger(
          "Warning: No session cookies configured. X may block unauthenticated scraping."
        );
      }

      const page = await context.newPage();
      return await fn(page, browser);
    } finally {
      await browser.close();
    }
  }

  async fetchPosts(): Promise<PostData[]> {
    return this.withBrowser(async (page) => {
      this.logger(`Fetching posts for @${this.username}...`);

      // Set up GraphQL listener BEFORE navigation to catch UserByScreenName
      const profilePromise = listenForProfileGraphQL(page);

      await page.goto(`https://x.com/${this.username}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait for timeline to load
      await page.waitForTimeout(3000);

      // Check if GraphQL captured profile stats
      const graphQLProfile = await Promise.race([
        profilePromise,
        new Promise<null>((r) => setTimeout(() => r(null), 1000)),
      ]);

      if (graphQLProfile && graphQLProfile.followers > 0) {
        this.cachedProfileStats = {
          followers: graphQLProfile.followers,
          following: graphQLProfile.following,
        };
        this.logger(
          `Captured profile stats via GraphQL: ${graphQLProfile.followers} followers`
        );
      } else {
        // Fallback to DOM scraping
        const domProfile = await extractProfileStats(page);
        if (domProfile && domProfile.followers > 0) {
          this.cachedProfileStats = {
            followers: domProfile.followers,
            following: domProfile.following,
          };
          this.logger(
            `Captured profile stats via DOM: ${domProfile.followers} followers`
          );
        }
      }

      const scraped = await extractPostsFromTimeline(
        page,
        this.username,
        MAX_POSTS_PER_SYNC
      );

      this.logger(`Scraped ${scraped.length} posts from timeline`);

      return scraped.map((post) => ({
        postId: post.postId,
        platform: "twitter" as const,
        postType: post.hasVideo ? ("video" as const) : post.hasImage ? ("image" as const) : ("text" as const),
        title: post.text.substring(0, 200) || null,
        description: post.text || null,
        contentUrl: post.permalink,
        thumbnailUrl: null,
        publishedAt: new Date(post.publishedAt),
      }));
    });
  }

  async fetchMetrics(postIds: string[]): Promise<MetricData[]> {
    return this.withBrowser(async (page) => {
      const metrics: MetricData[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      this.logger(`Fetching metrics for ${postIds.length} posts...`);

      for (const postId of postIds) {
        try {
          const postUrl = `https://x.com/${this.username}/status/${postId}`;
          let scraped = await extractMetricsFromGraphQL(page, postUrl);

          // Fall back to DOM scraping if GraphQL returned nothing
          if (
            scraped.views === undefined &&
            scraped.likes === undefined &&
            scraped.retweets === undefined
          ) {
            this.logger(`GraphQL empty for ${postId}, trying DOM fallback`);
            scraped = await extractMetricsFromPost(page, postUrl);
          }

          if (scraped.views !== undefined) {
            metrics.push({
              postId,
              metricType: "views",
              metricDate: today,
              metricValue: BigInt(scraped.views),
            });
          }

          if (scraped.likes !== undefined) {
            metrics.push({
              postId,
              metricType: "likes",
              metricDate: today,
              metricValue: BigInt(scraped.likes),
            });
          }

          if (scraped.retweets !== undefined) {
            metrics.push({
              postId,
              metricType: "shares",
              metricDate: today,
              metricValue: BigInt(scraped.retweets),
            });
          }

          if (scraped.replies !== undefined) {
            metrics.push({
              postId,
              metricType: "comments",
              metricDate: today,
              metricValue: BigInt(scraped.replies),
            });
          }

          if (scraped.bookmarks !== undefined) {
            metrics.push({
              postId,
              metricType: "bookmarks",
              metricDate: today,
              metricValue: BigInt(scraped.bookmarks),
            });
          }

          // Rate limiting: 2-5s between page loads
          await this.delay(PAGE_LOAD_DELAY + Math.random() * 2000);
        } catch (err) {
          this.logger(`Failed to scrape metrics for post ${postId}: ${err}`);
        }
      }

      return metrics;
    });
  }

  async getAccountStats(): Promise<AccountStats> {
    // Use cached stats from fetchPosts() to avoid launching another browser
    if (this.cachedProfileStats) {
      this.logger(
        `Using cached profile stats: ${this.cachedProfileStats.followers} followers`
      );
      return this.cachedProfileStats;
    }

    // Fallback: launch a fresh browser if cache is empty
    return this.withBrowser(async (page) => {
      this.logger(`Fetching profile stats for @${this.username}...`);

      await page.goto(`https://x.com/${this.username}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      await page.waitForTimeout(3000);

      const profile = await extractProfileStats(page);

      if (!profile) {
        this.logger("Failed to extract profile stats");
        return { followers: 0 };
      }

      return {
        followers: profile.followers,
        following: profile.following,
      };
    });
  }
}
