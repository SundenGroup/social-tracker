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
import type { SocialAccount } from "@prisma/client";

const MAX_VIDEOS_PER_SYNC = 50;
const PAGE_LOAD_DELAY = 3000;

export class TikTokCollector extends BaseCollector {
  private username: string;

  constructor(account: SocialAccount) {
    super(account);
    this.username = account.accountId.replace(/^@/, "");
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
      const page = await context.newPage();
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

      await page.waitForTimeout(3000);

      const videos = await extractVideosFromDOM(
        page,
        this.username,
        MAX_VIDEOS_PER_SYNC
      );

      this.logger(`Scraped ${videos.length} videos from profile`);

      return videos.map((video) => ({
        postId: video.videoId,
        platform: "tiktok" as const,
        postType: "video" as const, // TikTok is all video
        title: video.description.substring(0, 200) || null,
        description: video.description || null,
        contentUrl: video.permalink,
        thumbnailUrl: video.coverUrl,
        publishedAt: new Date(), // TikTok profile page doesn't show exact dates
      }));
    });
  }

  async fetchMetrics(postIds: string[]): Promise<MetricData[]> {
    return this.withBrowser(async (page) => {
      const metrics: MetricData[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      this.logger(`Fetching metrics for ${postIds.length} videos...`);

      for (const videoId of postIds) {
        try {
          const videoUrl = `https://www.tiktok.com/@${this.username}/video/${videoId}`;
          const scraped = await extractMetricsFromPage(page, videoUrl);

          if (scraped.views !== undefined) {
            metrics.push({
              postId: videoId,
              metricType: "views",
              metricDate: today,
              metricValue: BigInt(scraped.views),
            });
          }

          if (scraped.likes !== undefined) {
            metrics.push({
              postId: videoId,
              metricType: "likes",
              metricDate: today,
              metricValue: BigInt(scraped.likes),
            });
          }

          if (scraped.comments !== undefined) {
            metrics.push({
              postId: videoId,
              metricType: "comments",
              metricDate: today,
              metricValue: BigInt(scraped.comments),
            });
          }

          if (scraped.shares !== undefined) {
            metrics.push({
              postId: videoId,
              metricType: "shares",
              metricDate: today,
              metricValue: BigInt(scraped.shares),
            });
          }

          // Rate limiting: 3-5s between page loads
          await this.delay(PAGE_LOAD_DELAY + Math.random() * 2000);
        } catch (err) {
          this.logger(`Failed to scrape metrics for video ${videoId}: ${err}`);
        }
      }

      return metrics;
    });
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
