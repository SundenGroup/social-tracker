import { chromium, type Browser, type Page } from "playwright";
import {
  BaseCollector,
  type PostData,
  type MetricData,
  type AccountStats,
} from "./base-collector";
import {
  extractVideosFromDOM,
  extractMetricsFromPage,
  extractProfileStats,
  getRandomUserAgent,
} from "@/lib/utils/tiktok-scraper";
import {
  parseCookieData,
  loadCookiesIntoContext,
  validateCookiesForPlatform,
  areCookiesExpired,
} from "@/lib/utils/browser-cookies";
import type { SocialAccount } from "@prisma/client";

const MAX_VIDEOS_PER_SYNC = 100;
const PAGE_LOAD_DELAY = 3000;

export class TikTokCollector extends BaseCollector {
  private username: string;
  private hasCookies: boolean;
  // Cache metrics from hydration data during fetchPosts to avoid per-video page loads
  private metricsCache = new Map<string, { views: number; likes: number; comments: number; shares: number }>();

  constructor(account: SocialAccount) {
    super(account);
    this.username = account.accountId.replace(/^@/, "");
    this.hasCookies = !!account.authToken;
  }

  private async withBrowser<T>(
    fn: (page: Page, browser: Browser) => Promise<T>
  ): Promise<T> {
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    try {
      const context = await browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
        timezoneId: "America/New_York",
      });

      // Remove navigator.webdriver fingerprint
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
      });

      // Load session cookies if available
      if (this.hasCookies) {
        try {
          const cookieData = parseCookieData(this.account.authToken!);

          const validation = validateCookiesForPlatform(cookieData, "tiktok");
          if (!validation.valid) {
            this.logger(
              `Warning: TikTok cookies missing: ${validation.missing.join(", ")}. Video list may be incomplete.`
            );
          } else if (areCookiesExpired(cookieData, "tiktok")) {
            this.logger(
              "Warning: TikTok session cookies have expired. Video list may be empty."
            );
          } else {
            const loaded = await loadCookiesIntoContext(context, cookieData);
            this.logger(`Loaded ${loaded} cookies into browser context`);
          }
        } catch (err) {
          this.logger(`Warning: Failed to load TikTok cookies: ${err}`);
        }
      } else {
        this.logger(
          "Warning: No session cookies configured. Video list may be empty without session cookies."
        );
      }

      const page = await context.newPage();

      // Warm up session by visiting homepage first (helps avoid CAPTCHA)
      if (this.hasCookies) {
        try {
          await page.goto("https://www.tiktok.com/foryou", {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });
          await page.waitForTimeout(3000 + Math.random() * 2000);
        } catch {
          // Homepage warm-up failed, continue anyway
        }
      }

      return await fn(page, browser);
    } finally {
      await browser.close();
    }
  }

  async fetchPosts(): Promise<PostData[]> {
    return this.withBrowser(async (page) => {
      this.logger(`Fetching videos for @${this.username}...`);

      await page.goto(`https://www.tiktok.com/@${this.username}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait for React hydration
      await page.waitForTimeout(5000);

      // Scroll to load more videos (TikTok lazy-loads video cards)
      let prevCount = 0;
      for (let scroll = 0; scroll < 20; scroll++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await page.waitForTimeout(2000 + Math.random() * 1000);

        const currentCount = await page.$$eval(
          'a[href*="/video/"]',
          (els) => new Set(els.map((e) => e.getAttribute("href"))).size
        );
        if (currentCount === prevCount && scroll > 3) break;
        prevCount = currentCount;
      }

      const videos = await extractVideosFromDOM(
        page,
        this.username,
        MAX_VIDEOS_PER_SYNC
      );

      this.logger(`Scraped ${videos.length} videos from profile`);

      // Cache metrics from hydration data to avoid per-video page loads
      for (const video of videos) {
        if (video.views > 0 || video.likes || video.comments || video.shares) {
          this.metricsCache.set(video.videoId, {
            views: video.views,
            likes: video.likes ?? 0,
            comments: video.comments ?? 0,
            shares: video.shares ?? 0,
          });
        }
      }

      this.logger(`Cached metrics for ${this.metricsCache.size} videos from hydration data`);

      return videos.map((video) => ({
        postId: video.videoId,
        platform: "tiktok" as const,
        postType: "video" as const,
        title: this.sanitizeText(video.description.substring(0, 200)) || null,
        description: this.sanitizeText(video.description) || null,
        contentUrl: video.permalink,
        thumbnailUrl: video.coverUrl,
        publishedAt: video.createTime
          ? new Date(video.createTime * 1000)
          : new Date(),
      }));
    });
  }

  async fetchMetrics(postIds: string[]): Promise<MetricData[]> {
    const metrics: MetricData[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use cached metrics from hydration data (collected during fetchPosts)
    const uncachedIds: string[] = [];

    for (const videoId of postIds) {
      const cached = this.metricsCache.get(videoId);
      if (cached) {
        if (cached.views > 0) metrics.push({ postId: videoId, metricType: "views", metricDate: today, metricValue: BigInt(cached.views) });
        if (cached.likes > 0) metrics.push({ postId: videoId, metricType: "likes", metricDate: today, metricValue: BigInt(cached.likes) });
        if (cached.comments > 0) metrics.push({ postId: videoId, metricType: "comments", metricDate: today, metricValue: BigInt(cached.comments) });
        if (cached.shares > 0) metrics.push({ postId: videoId, metricType: "shares", metricDate: today, metricValue: BigInt(cached.shares) });
      } else {
        uncachedIds.push(videoId);
      }
    }

    this.logger(`Metrics from cache: ${postIds.length - uncachedIds.length}, need scraping: ${uncachedIds.length}`);

    // Fall back to per-video page loads for uncached videos
    if (uncachedIds.length > 0) {
      await this.withBrowser(async (page) => {
        for (const videoId of uncachedIds) {
          try {
            const videoUrl = `https://www.tiktok.com/@${this.username}/video/${videoId}`;
            const scraped = await extractMetricsFromPage(page, videoUrl);

            if (scraped.views !== undefined) metrics.push({ postId: videoId, metricType: "views", metricDate: today, metricValue: BigInt(scraped.views) });
            if (scraped.likes !== undefined) metrics.push({ postId: videoId, metricType: "likes", metricDate: today, metricValue: BigInt(scraped.likes) });
            if (scraped.comments !== undefined) metrics.push({ postId: videoId, metricType: "comments", metricDate: today, metricValue: BigInt(scraped.comments) });
            if (scraped.shares !== undefined) metrics.push({ postId: videoId, metricType: "shares", metricDate: today, metricValue: BigInt(scraped.shares) });

            await this.delay(PAGE_LOAD_DELAY + Math.random() * 2000);
          } catch (err) {
            this.logger(`Failed to scrape metrics for video ${videoId}: ${err}`);
          }
        }
      });
    }

    return metrics;
  }

  async getAccountStats(): Promise<AccountStats> {
    return this.withBrowser(async (page) => {
      this.logger(`Fetching profile stats for @${this.username}...`);

      await page.goto(`https://www.tiktok.com/@${this.username}`, {
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
        totalPosts: profile.videoCount,
      };
    });
  }
}
