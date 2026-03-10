import axios from "axios";
import { decrypt } from "@/lib/api-keys";
import {
  BaseCollector,
  type PostData,
  type MetricData,
  type AccountStats,
} from "./base-collector";
import type { SocialAccount, PostType } from "@prisma/client";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";
const RATE_LIMIT_DELAY = 2000; // 200 calls/hour ≈ 1 call per 18s, but batch helps

export class InstagramCollector extends BaseCollector {
  private accessToken: string;

  constructor(account: SocialAccount) {
    super(account);

    if (!account.authToken) {
      throw new Error("Instagram account missing access token");
    }

    this.accessToken = decrypt(account.authToken);
  }

  async fetchPosts(): Promise<PostData[]> {
    const posts: PostData[] = [];
    const igUserId = this.account.accountId;

    this.logger("Fetching media from Instagram Graph API...");

    let url = `${GRAPH_API_BASE}/${igUserId}/media`;
    let params: Record<string, string> = {
      access_token: this.accessToken,
      fields: "id,media_type,media_product_type,caption,timestamp,permalink,thumbnail_url,media_url",
      limit: "50",
    };

    let pageCount = 0;
    const maxPages = 10;

    while (url && pageCount < maxPages) {
      const res = await axios.get(url, { params });
      const data = res.data;

      for (const item of data.data ?? []) {
        const postType = this.mapMediaType(
          item.media_type,
          item.media_product_type
        );

        posts.push({
          postId: item.id,
          platform: "instagram",
          postType,
          title: item.caption ? item.caption.substring(0, 200) : null,
          description: item.caption ?? null,
          contentUrl: item.permalink ?? `https://www.instagram.com/p/${item.id}/`,
          thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
          publishedAt: new Date(item.timestamp),
        });
      }

      // Pagination — next page cursor
      url = data.paging?.next ?? null;
      params = {}; // Next URL already has all params
      pageCount++;

      await this.delay(RATE_LIMIT_DELAY);
    }

    this.logger(`Fetched ${posts.length} posts`);
    return posts;
  }

  async fetchMetrics(postIds: string[]): Promise<MetricData[]> {
    const metrics: MetricData[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    this.logger(`Fetching metrics for ${postIds.length} posts...`);

    for (const postId of postIds) {
      try {
        // Get basic metrics (available for all media types)
        const basicRes = await axios.get(
          `${GRAPH_API_BASE}/${postId}`,
          {
            params: {
              access_token: this.accessToken,
              fields: "like_count,comments_count",
            },
          }
        );

        const basic = basicRes.data;

        if (basic.like_count !== undefined) {
          metrics.push({
            postId,
            metricType: "likes",
            metricDate: today,
            metricValue: BigInt(basic.like_count),
          });
        }

        if (basic.comments_count !== undefined) {
          metrics.push({
            postId,
            metricType: "comments",
            metricDate: today,
            metricValue: BigInt(basic.comments_count),
          });
        }

        // Get insights (impressions, reach, shares, saves)
        // Available for business/creator accounts only
        try {
          const insightsRes = await axios.get(
            `${GRAPH_API_BASE}/${postId}/insights`,
            {
              params: {
                access_token: this.accessToken,
                metric: "impressions,reach,saved,shares",
              },
            }
          );

          for (const insight of insightsRes.data.data ?? []) {
            const value = insight.values?.[0]?.value ?? 0;
            const metricType = this.mapInsightMetric(insight.name);
            if (metricType) {
              metrics.push({
                postId,
                metricType,
                metricDate: today,
                metricValue: BigInt(value),
              });
            }
          }
        } catch {
          // Insights may not be available for all media types
        }

        await this.delay(RATE_LIMIT_DELAY);
      } catch (err) {
        this.logger(`Failed to fetch metrics for post ${postId}: ${err}`);
      }
    }

    return metrics;
  }

  async getAccountStats(): Promise<AccountStats> {
    this.logger("Fetching account stats...");

    try {
      const res = await axios.get(
        `${GRAPH_API_BASE}/${this.account.accountId}`,
        {
          params: {
            access_token: this.accessToken,
            fields: "followers_count,follows_count,media_count",
          },
        }
      );

      return {
        followers: res.data.followers_count ?? 0,
        following: res.data.follows_count ?? 0,
        totalPosts: res.data.media_count ?? 0,
      };
    } catch (err) {
      this.logger(`Failed to get account stats: ${err}`);
      return { followers: 0 };
    }
  }

  private mapMediaType(
    mediaType: string,
    mediaProductType?: string
  ): PostType {
    // media_product_type: FEED, REELS, STORIES
    if (mediaProductType === "REELS") return "video";
    if (mediaProductType === "STORIES") return "story";

    switch (mediaType) {
      case "VIDEO":
        return "video";
      case "CAROUSEL_ALBUM":
        return "carousel";
      case "IMAGE":
      default:
        return "image";
    }
  }

  private mapInsightMetric(
    name: string
  ): MetricData["metricType"] | null {
    switch (name) {
      case "impressions":
        return "impressions";
      case "reach":
        return "reach";
      case "saved":
        return "bookmarks";
      case "shares":
        return "shares";
      default:
        return null;
    }
  }
}
