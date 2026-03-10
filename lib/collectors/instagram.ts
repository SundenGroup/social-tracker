import { chromium, type Browser, type Page } from "playwright";
import {
  BaseCollector,
  type PostData,
  type MetricData,
  type AccountStats,
} from "./base-collector";
import {
  parseCookieData,
  loadCookiesIntoContext,
  validateCookiesForPlatform,
  areCookiesExpired,
} from "@/lib/utils/browser-cookies";
import {
  fetchAllInstagramPosts,
  resolveInstagramUserId,
  fetchInstagramProfile,
  type ScrapedInstagramPost,
} from "@/lib/utils/instagram-scraper";
import { getRandomUserAgent } from "@/lib/utils/tiktok-scraper";
import type { SocialAccount, PostType } from "@prisma/client";

const MAX_POSTS_PER_SYNC = 200;

export class InstagramCollector extends BaseCollector {
  private username: string;
  // Cache metrics from fetchPosts so fetchMetrics doesn't need a second browser session
  private metricsCache = new Map<
    string,
    { likes: number; comments: number; plays: number }
  >();

  constructor(account: SocialAccount) {
    super(account);
    this.username = account.accountId.replace(/^@/, "");

    if (!account.authToken) {
      throw new Error(
        "Instagram account missing session cookies. Export cookies from a logged-in browser and paste them in the account settings."
      );
    }
  }

  private async withAuthenticatedBrowser<T>(
    fn: (page: Page, browser: Browser) => Promise<T>
  ): Promise<T> {
    // Parse and validate cookies
    const cookieData = parseCookieData(this.account.authToken!);

    const validation = validateCookiesForPlatform(cookieData, "instagram");
    if (!validation.valid) {
      throw new Error(
        `Instagram session cookies missing required cookies: ${validation.missing.join(", ")}. Re-export cookies from your browser.`
      );
    }

    if (areCookiesExpired(cookieData, "instagram")) {
      throw new Error(
        "Instagram session cookies have expired. Please log in to Instagram in your browser and re-export fresh cookies."
      );
    }

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport: { width: 1280, height: 800 },
      });

      const loaded = await loadCookiesIntoContext(context, cookieData);
      this.logger(`Loaded ${loaded} cookies into browser context`);

      const page = await context.newPage();

      // Navigate to instagram.com to establish the session
      await page.goto("https://www.instagram.com/", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      return await fn(page, browser);
    } finally {
      await browser.close();
    }
  }

  async fetchPosts(): Promise<PostData[]> {
    return this.withAuthenticatedBrowser(async (page) => {
      this.logger(`Fetching posts for @${this.username}...`);

      // Resolve username to numeric userId
      const userId = await resolveInstagramUserId(page, this.username);
      this.logger(`Resolved @${this.username} to userId ${userId}`);

      // Fetch posts via internal feed API
      const igPosts = await fetchAllInstagramPosts(
        page,
        userId,
        MAX_POSTS_PER_SYNC
      );

      this.logger(`Fetched ${igPosts.length} posts from feed API`);

      // Cache metrics for fetchMetrics()
      for (const post of igPosts) {
        this.metricsCache.set(post.postId, {
          likes: post.likeCount,
          comments: post.commentCount,
          plays: post.playCount,
        });
      }

      return igPosts.map((post) => ({
        postId: post.postId,
        platform: "instagram" as const,
        postType: this.mapMediaType(post),
        title: post.caption ? post.caption.substring(0, 200) : null,
        description: post.caption || null,
        contentUrl: post.permalink,
        thumbnailUrl: post.thumbnailUrl,
        publishedAt: new Date(post.publishedAt * 1000),
      }));
    });
  }

  async fetchMetrics(postIds: string[]): Promise<MetricData[]> {
    const metrics: MetricData[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    this.logger(
      `Reading cached metrics for ${postIds.length} posts...`
    );

    for (const postId of postIds) {
      const cached = this.metricsCache.get(postId);
      if (!cached) continue;

      metrics.push({
        postId,
        metricType: "likes",
        metricDate: today,
        metricValue: BigInt(cached.likes),
      });

      metrics.push({
        postId,
        metricType: "comments",
        metricDate: today,
        metricValue: BigInt(cached.comments),
      });

      if (cached.plays > 0) {
        metrics.push({
          postId,
          metricType: "views",
          metricDate: today,
          metricValue: BigInt(cached.plays),
        });
      }
    }

    this.logger(`Returned ${metrics.length} cached metric records`);
    return metrics;
  }

  async getAccountStats(): Promise<AccountStats> {
    return this.withAuthenticatedBrowser(async (page) => {
      this.logger(`Fetching profile stats for @${this.username}...`);

      const profile = await fetchInstagramProfile(page, this.username);

      return {
        followers: profile.followers,
        following: profile.following,
        totalPosts: profile.postCount,
      };
    });
  }

  private mapMediaType(post: ScrapedInstagramPost): PostType {
    if (post.isReel) return "video";
    switch (post.mediaType) {
      case "video":
        return "video";
      case "carousel":
        return "carousel";
      case "image":
      default:
        return "image";
    }
  }
}
