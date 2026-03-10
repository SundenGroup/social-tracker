import { google } from "googleapis";
import { decrypt } from "@/lib/api-keys";
import {
  BaseCollector,
  type PostData,
  type MetricData,
  type AccountStats,
} from "./base-collector";
import type { SocialAccount } from "@prisma/client";

const BATCH_SIZE = 50; // YouTube API max per request

export class YouTubeCollector extends BaseCollector {
  private youtube;

  constructor(account: SocialAccount) {
    super(account);

    const apiKey = account.apiKey
      ? decrypt(account.apiKey)
      : process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      throw new Error("YouTube API key not found. Set YOUTUBE_API_KEY in .env or add it to the account.");
    }

    this.youtube = google.youtube({
      version: "v3",
      auth: apiKey,
    });
  }

  async fetchPosts(): Promise<PostData[]> {
    const posts: PostData[] = [];

    // Get the channel's uploads playlist
    const channelRes = await this.youtube.channels.list({
      id: [this.account.accountId],
      part: ["contentDetails", "snippet"],
    });

    const channel = channelRes.data.items?.[0];
    if (!channel) {
      // Try by forHandle/customUrl
      const byHandle = await this.youtube.channels.list({
        forHandle: this.account.accountId,
        part: ["contentDetails", "snippet"],
      });
      const ch = byHandle.data.items?.[0];
      if (!ch) {
        this.logger("Channel not found");
        return posts;
      }
      return this.fetchUploadsFromPlaylist(
        ch.contentDetails?.relatedPlaylists?.uploads
      );
    }

    return this.fetchUploadsFromPlaylist(
      channel.contentDetails?.relatedPlaylists?.uploads
    );
  }

  private async fetchUploadsFromPlaylist(
    playlistId: string | null | undefined
  ): Promise<PostData[]> {
    if (!playlistId) {
      this.logger("No uploads playlist found");
      return [];
    }

    const posts: PostData[] = [];
    let nextPageToken: string | undefined;

    do {
      const res = await this.youtube.playlistItems.list({
        playlistId,
        part: ["snippet", "contentDetails"],
        maxResults: BATCH_SIZE,
        pageToken: nextPageToken,
      });

      for (const item of res.data.items ?? []) {
        const snippet = item.snippet;
        if (!snippet?.resourceId?.videoId) continue;

        const videoId = snippet.resourceId.videoId;

        posts.push({
          postId: videoId,
          platform: "youtube",
          postType: this.detectPostType(snippet.title ?? "", snippet.description ?? ""),
          title: snippet.title ?? null,
          description: snippet.description
            ? snippet.description.substring(0, 500)
            : null,
          contentUrl: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnailUrl:
            snippet.thumbnails?.high?.url ??
            snippet.thumbnails?.default?.url ??
            null,
          publishedAt: new Date(snippet.publishedAt ?? Date.now()),
        });
      }

      nextPageToken = res.data.nextPageToken ?? undefined;

      // Rate limit: YouTube API costs 1 unit per playlistItems.list
      await this.delay(100);
    } while (nextPageToken);

    return posts;
  }

  async fetchMetrics(postIds: string[]): Promise<MetricData[]> {
    const metrics: MetricData[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Batch video IDs into groups of 50
    for (let i = 0; i < postIds.length; i += BATCH_SIZE) {
      const batch = postIds.slice(i, i + BATCH_SIZE);

      const res = await this.youtube.videos.list({
        id: batch,
        part: ["statistics", "contentDetails"],
      });

      for (const video of res.data.items ?? []) {
        if (!video.id || !video.statistics) continue;

        const stats = video.statistics;

        if (stats.viewCount) {
          metrics.push({
            postId: video.id,
            metricType: "views",
            metricDate: today,
            metricValue: BigInt(stats.viewCount),
          });
        }

        if (stats.likeCount) {
          metrics.push({
            postId: video.id,
            metricType: "likes",
            metricDate: today,
            metricValue: BigInt(stats.likeCount),
          });
        }

        if (stats.commentCount) {
          metrics.push({
            postId: video.id,
            metricType: "comments",
            metricDate: today,
            metricValue: BigInt(stats.commentCount),
          });
        }

        // YouTube doesn't directly expose share count via API
        // Watch duration requires YouTube Analytics API (OAuth)
      }

      await this.delay(100);
    }

    return metrics;
  }

  async getAccountStats(): Promise<AccountStats> {
    const res = await this.youtube.channels.list({
      id: [this.account.accountId],
      part: ["statistics"],
    });

    const channel = res.data.items?.[0];
    if (!channel?.statistics) {
      // Try by handle
      const byHandle = await this.youtube.channels.list({
        forHandle: this.account.accountId,
        part: ["statistics"],
      });
      const ch = byHandle.data.items?.[0];
      if (!ch?.statistics) {
        return { followers: 0 };
      }
      return {
        followers: Number(ch.statistics.subscriberCount ?? 0),
        totalPosts: Number(ch.statistics.videoCount ?? 0),
      };
    }

    return {
      followers: Number(channel.statistics.subscriberCount ?? 0),
      totalPosts: Number(channel.statistics.videoCount ?? 0),
    };
  }

  private detectPostType(
    title: string,
    description: string
  ): "video" | "short" | "live" {
    const lower = title.toLowerCase() + " " + description.toLowerCase();
    if (lower.includes("#shorts") || lower.includes("#short")) return "short";
    if (lower.includes("live stream") || lower.includes("livestream"))
      return "live";
    return "video";
  }
}
