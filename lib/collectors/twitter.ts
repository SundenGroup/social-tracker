import { decrypt } from "@/lib/api-keys";
import { prisma } from "@/lib/db";
import {
  BaseCollector,
  type PostData,
  type MetricData,
  type AccountStats,
} from "./base-collector";
import type { SocialAccount } from "@prisma/client";

const BATCH_SIZE = 100; // X API max per request
const MAX_POSTS_PER_SYNC = 50; // Only fetch recent posts for discovery
const METRICS_REFRESH_DAYS = 14; // Refresh metrics for posts from last 14 days

interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    bookmark_count: number;
    impression_count: number;
  };
  attachments?: {
    media_keys?: string[];
  };
}

interface XMedia {
  media_key: string;
  type: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
}

export class TwitterCollector extends BaseCollector {
  private username: string;
  private bearerToken: string;
  private userId: string | null = null;
  private cachedAccountStats: AccountStats | null = null;

  constructor(account: SocialAccount) {
    super(account);
    this.username = account.accountId.replace(/^@/, "");

    const token = account.apiKey
      ? decrypt(account.apiKey)
      : process.env.TWITTER_BEARER_TOKEN;

    if (!token) {
      throw new Error(
        "X API bearer token not found. Set TWITTER_BEARER_TOKEN in .env or add it to the account."
      );
    }

    this.bearerToken = token;
  }

  private async xFetch<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.bearerToken}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`X API ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  /** Resolve username → numeric user ID (cached for the sync session) */
  private async getUserId(): Promise<string> {
    if (this.userId) return this.userId;

    const data = await this.xFetch<{
      data: { id: string; public_metrics: { followers_count: number; following_count: number; tweet_count: number } };
    }>(
      `https://api.x.com/2/users/by/username/${this.username}?user.fields=public_metrics`
    );

    this.userId = data.data.id;

    // Cache account stats so getAccountStats() doesn't need another call
    this.cachedAccountStats = {
      followers: data.data.public_metrics.followers_count,
      following: data.data.public_metrics.following_count,
      totalPosts: data.data.public_metrics.tweet_count,
    };

    this.logger(`Resolved @${this.username} → ID ${this.userId} (${this.cachedAccountStats.followers} followers)`);
    return this.userId;
  }

  async fetchPosts(): Promise<PostData[]> {
    const userId = await this.getUserId();
    const posts: PostData[] = [];

    this.logger(`Fetching latest ${MAX_POSTS_PER_SYNC} posts for @${this.username} via API...`);

    const params = new URLSearchParams({
      max_results: String(MAX_POSTS_PER_SYNC),
      "tweet.fields": "created_at,public_metrics,attachments",
      "media.fields": "type,url,preview_image_url",
      expansions: "attachments.media_keys",
      exclude: "retweets,replies",
    });

    const res = await this.xFetch<{
      data?: XTweet[];
      includes?: { media?: XMedia[] };
      meta: { result_count: number; next_token?: string };
    }>(`https://api.x.com/2/users/${userId}/tweets?${params}`);

    if (!res.data || res.data.length === 0) {
      this.logger("No posts returned from API");
      return posts;
    }

    // Build media lookup from includes
    const mediaMap = new Map<string, XMedia>();
    for (const m of res.includes?.media ?? []) {
      mediaMap.set(m.media_key, m);
    }

    for (const tweet of res.data) {
      const mediaKeys = tweet.attachments?.media_keys ?? [];
      const mediaItems = mediaKeys.map((k) => mediaMap.get(k)).filter(Boolean) as XMedia[];
      const hasVideo = mediaItems.some((m) => m.type === "video" || m.type === "animated_gif");
      const hasImage = mediaItems.some((m) => m.type === "photo");
      const postType = hasVideo ? "video" as const : hasImage ? "image" as const : "text" as const;

      const thumbnail = mediaItems[0]?.preview_image_url ?? mediaItems[0]?.url ?? null;

      posts.push({
        postId: tweet.id,
        platform: "twitter",
        postType,
        title: this.sanitizeText(tweet.text.substring(0, 200)) || null,
        description: this.sanitizeText(tweet.text) || null,
        contentUrl: `https://x.com/${this.username}/status/${tweet.id}`,
        thumbnailUrl: thumbnail,
        publishedAt: new Date(tweet.created_at ?? Date.now()),
      });
    }

    this.logger(`Fetched ${posts.length} posts via API`);
    return posts;
  }

  async fetchMetrics(_postIds: string[]): Promise<MetricData[]> {
    const metrics: MetricData[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Refresh metrics for all posts from the last N days (not just newly discovered ones)
    const cutoff = new Date(Date.now() - METRICS_REFRESH_DAYS * 86400000);
    const dbPosts = await prisma.post.findMany({
      where: {
        socialAccountId: this.account.id,
        publishedAt: { gte: cutoff },
        isDeleted: false,
      },
      select: { postId: true },
    });

    const postIds = dbPosts.map((p) => p.postId);
    this.logger(`Refreshing metrics for ${postIds.length} posts from last ${METRICS_REFRESH_DAYS} days...`);

    if (postIds.length === 0) return metrics;

    // Batch tweet IDs into groups of 100
    for (let i = 0; i < postIds.length; i += BATCH_SIZE) {
      const batch = postIds.slice(i, i + BATCH_SIZE);

      const res = await this.xFetch<{
        data?: XTweet[];
      }>(
        `https://api.x.com/2/tweets?ids=${batch.join(",")}&tweet.fields=public_metrics`
      );

      for (const tweet of res.data ?? []) {
        const pm = tweet.public_metrics;
        if (!pm) continue;

        if (pm.impression_count > 0) {
          metrics.push({
            postId: tweet.id,
            metricType: "views",
            metricDate: today,
            metricValue: BigInt(pm.impression_count),
          });
        }

        if (pm.like_count > 0) {
          metrics.push({
            postId: tweet.id,
            metricType: "likes",
            metricDate: today,
            metricValue: BigInt(pm.like_count),
          });
        }

        if (pm.retweet_count > 0) {
          metrics.push({
            postId: tweet.id,
            metricType: "shares",
            metricDate: today,
            metricValue: BigInt(pm.retweet_count),
          });
        }

        if (pm.reply_count > 0) {
          metrics.push({
            postId: tweet.id,
            metricType: "comments",
            metricDate: today,
            metricValue: BigInt(pm.reply_count),
          });
        }

        if (pm.bookmark_count > 0) {
          metrics.push({
            postId: tweet.id,
            metricType: "bookmarks",
            metricDate: today,
            metricValue: BigInt(pm.bookmark_count),
          });
        }
      }
    }

    this.logger(`Fetched ${metrics.length} metric records via API`);
    return metrics;
  }

  async getAccountStats(): Promise<AccountStats> {
    if (this.cachedAccountStats) {
      return this.cachedAccountStats;
    }

    // Fetch fresh if not cached (shouldn't happen since fetchPosts calls getUserId first)
    await this.getUserId();
    return this.cachedAccountStats ?? { followers: 0 };
  }
}
