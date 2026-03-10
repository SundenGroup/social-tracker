import { google } from "googleapis";
import { decrypt } from "@/lib/api-keys";
import { prisma } from "@/lib/db";
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
          description: snippet.description ?? null,
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

        // Detect Shorts: check duration first, then confirm via URL probe
        const duration = video.contentDetails?.duration;
        if (duration) {
          const seconds = parseISO8601Duration(duration);
          // Videos <= 3 min are Short candidates (YouTube extended Shorts length)
          // Use URL probe to definitively confirm
          let detectedType: "short" | "video" = "video";
          if (seconds > 0 && seconds <= 180) {
            detectedType = await isYouTubeShort(video.id) ? "short" : "video";
          }
          const contentUrl = detectedType === "short"
            ? `https://www.youtube.com/shorts/${video.id}`
            : `https://www.youtube.com/watch?v=${video.id}`;

          await prisma.post.updateMany({
            where: {
              socialAccountId: this.account.id,
              postId: video.id,
            },
            data: { postType: detectedType, contentUrl },
          });
        }

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
    // Initial guess based on text — will be corrected by duration in fetchMetrics
    const lower = title.toLowerCase() + " " + description.toLowerCase();
    if (lower.includes("#shorts") || lower.includes("#short")) return "short";
    if (lower.includes("live stream") || lower.includes("livestream"))
      return "live";
    return "video";
  }
}

/** Parse ISO 8601 duration (e.g., "PT1M30S", "PT45S", "PT1H2M") to seconds */
function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Check if a YouTube video is a Short by probing the /shorts/ URL.
 * YouTube returns 200 for Shorts and 303 redirect for regular videos.
 */
async function isYouTubeShort(videoId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: "HEAD",
      redirect: "manual",
    });
    // 200 = it's a Short, 303 = redirect means regular video
    return res.status === 200;
  } catch {
    return false;
  }
}
