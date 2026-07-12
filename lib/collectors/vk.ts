import { prisma } from "@/lib/db";
import {
  BaseCollector,
  type PostData,
  type MetricData,
  type AccountStats,
} from "./base-collector";
import type { SocialAccount } from "@prisma/client";

/**
 * VK collector — works in hybrid mode:
 *
 * 1. Discovery + wall-level metrics (likes/comments/reposts per post, plus
 *    the attachedVideoId when a post has a video) are provided externally
 *    by the Mac-based Playwright scraper pushing to /api/sync/ingest.
 *    That's the only path that works reliably from a residential IP.
 *
 * 2. Video-level view counts come from VK's public video embed endpoint
 *    (`vk.com/video_ext.php?oid=-X&id=Y`) which DOES work from a datacenter
 *    IP without auth. This collector's fetchMetrics() walks every existing
 *    VK post that has an attachedVideoId and refreshes its view count.
 *
 * fetchPosts() returns [] — discovery is always external for VK — and
 * getAccountStats() falls back to the last rollup on the account (Mac
 * scraper owns follower counts).
 */

interface VideoExtMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  reposts: number | null;
}

/* ————— Official VK API (activates when VK_SERVICE_TOKEN is set) —————
 * A service token from a free VK app (dev.vk.com → create app → service
 * key) unlocks wall.get / groups.getById from ANY IP — datacenter
 * included. When present, discovery + follower counts move fully
 * server-side and the Mac Playwright scraper becomes redundant for VK.
 * Scraping vk.com HTML from the droplet was tested and is login-walled
 * for datacenter IPs, so the API is the only clean server-side path. */

const VK_API_VERSION = "5.199";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function vkApi<T = any>(method: string, params: Record<string, string>): Promise<T | null> {
  const token = process.env.VK_SERVICE_TOKEN;
  if (!token) return null;
  const qs = new URLSearchParams({ ...params, access_token: token, v: VK_API_VERSION });
  try {
    const res = await fetch(`https://api.vk.com/method/${method}?${qs}`, {
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json()) as { response?: T; error?: { error_msg: string } };
    if (json.error) {
      console.error(`[VK] API ${method} error: ${json.error.error_msg}`);
      return null;
    }
    return json.response ?? null;
  } catch (err) {
    console.error(`[VK] API ${method} failed:`, err);
    return null;
  }
}

interface VkWallItem {
  id: number;
  owner_id: number;
  date: number;
  text?: string;
  is_pinned?: number;
  likes?: { count: number };
  comments?: { count: number };
  reposts?: { count: number };
  views?: { count: number };
  attachments?: Array<{
    type: string;
    video?: { id: number; owner_id: number; image?: Array<{ url: string; width: number }> };
    photo?: { sizes?: Array<{ url: string; width: number }> };
  }>;
}

/** Owner IDs in VK are negative for groups, positive for users. The Mac
 *  scraper stores them on the account as accountId="pubg" (screen name);
 *  the numeric group id is discovered once at ingest time and baked into
 *  each post's `attachedVideoId` format. Here we accept both 456251681
 *  and -148211806_456251681 shapes. */
function parseAttachedVideoId(raw: string): { oid: string; id: string } | null {
  // Shape A: "<oid>_<id>" — includes the group id
  const m = raw.match(/^(-?\d+)_(\d+)$/);
  if (m) return { oid: m[1], id: m[2] };
  // Shape B: just the numeric video id (owner id lives elsewhere on the
  // account). Not currently used but reserved in case we denormalize.
  return null;
}

async function fetchVideoExt(oid: string, id: string): Promise<VideoExtMetrics | null> {
  const url = `https://vk.com/video_ext.php?oid=${encodeURIComponent(oid)}&id=${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
      // VK is generous with this endpoint but a 15s ceiling protects us
      // from a slow response blocking the sync pipeline.
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Metrics are embedded as JSON fragments directly in the HTML.
    const num = (pattern: RegExp): number | null => {
      const m = html.match(pattern);
      return m ? Number(m[1]) : null;
    };

    return {
      views: num(/"views":(\d+)/),
      likes: num(/"likes":\{\s*"count":(\d+)/),
      comments: num(/"comments":(\d+)/),
      reposts: num(/"reposts":\{\s*"count":(\d+)/),
    };
  } catch (err) {
    console.error(`[VK] video_ext fetch failed for ${oid}_${id}:`, err);
    return null;
  }
}

export class VKCollector extends BaseCollector {
  constructor(account: SocialAccount) {
    super(account);
  }

  /** With VK_SERVICE_TOKEN: full server-side discovery via wall.get.
   *  Without it: no-op — discovery stays with the Mac scraper. */
  async fetchPosts(): Promise<PostData[]> {
    if (!process.env.VK_SERVICE_TOKEN) {
      this.logger(
        "fetchPosts → no-op; set VK_SERVICE_TOKEN to enable official-API discovery (currently relies on the remote Playwright scraper)"
      );
      return [];
    }

    const resp = await vkApi<{ items: VkWallItem[] }>("wall.get", {
      domain: this.account.accountId,
      count: "30",
    });
    if (!resp?.items) {
      this.logger("fetchPosts → wall.get returned nothing");
      return [];
    }

    const posts: PostData[] = [];
    for (const item of resp.items) {
      const video = item.attachments?.find((a) => a.type === "video")?.video;
      const photo = item.attachments?.find((a) => a.type === "photo")?.photo;
      const biggest = <S extends { url: string; width: number }>(sizes?: S[]) =>
        sizes && sizes.length > 0 ? [...sizes].sort((a, b) => b.width - a.width)[0].url : null;

      posts.push({
        // Bare wall item id — matches what the Mac scraper has always
        // written, so upserts hit the same rows (no duplicates).
        postId: String(item.id),
        platform: "vk",
        postType: video ? "video" : photo ? "image" : "text",
        title: null,
        description: item.text || null,
        contentUrl: `https://vk.com/wall${item.owner_id}_${item.id}`,
        thumbnailUrl: video ? biggest(video.image) : biggest(photo?.sizes),
        publishedAt: new Date(item.date * 1000),
        attachedVideoId: video ? `${video.owner_id}_${video.id}` : null,
      });
    }
    this.logger(`fetchPosts → ${posts.length} posts from wall.get (official API)`);
    return posts;
  }

  /**
   * For every VK post that has an `attachedVideoId`, refresh its view count
   * (and optionally likes/comments/reposts) from video_ext.php.
   *
   * We intentionally preserve wall-level likes/comments/reposts — those are
   * what the Mac scraper just pushed and they're what editors care about.
   * Views, however, only exist at the video level, so we fill them in here.
   */
  async fetchMetrics(postIds: string[]): Promise<MetricData[]> {
    if (postIds.length === 0) return [];

    const metrics: MetricData[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only the posts with an attachedVideoId need a video_ext.php lookup.
    const videoPosts = await prisma.post.findMany({
      where: {
        socialAccountId: this.account.id,
        postId: { in: postIds },
        attachedVideoId: { not: null },
      },
      select: { id: true, postId: true, attachedVideoId: true },
    });

    if (videoPosts.length === 0) {
      this.logger("fetchMetrics → no posts with attached videos, nothing to refresh");
      return [];
    }

    this.logger(`Refreshing video views for ${videoPosts.length} VK posts via video_ext.php...`);

    for (const post of videoPosts) {
      if (!post.attachedVideoId) continue;
      const parts = parseAttachedVideoId(post.attachedVideoId);
      if (!parts) continue;

      const vm = await fetchVideoExt(parts.oid, parts.id);
      if (!vm) continue;

      if (vm.views != null && vm.views > 0) {
        metrics.push({
          postId: post.id,
          metricType: "views",
          metricDate: today,
          metricValue: BigInt(vm.views),
        });
      }
      // Light polite delay — VK is generous here but 1 req per video with
      // no pause is fine for our cadence (a few dozen posts a day).
      await new Promise((r) => setTimeout(r, 120));
    }

    this.logger(`Fetched ${metrics.length} metric records from video_ext.php`);

    // With the official API: wall-level likes/comments/reposts (and VK's
    // native post views) for EVERY post — the counters the Mac scraper
    // used to read from the DOM.
    if (process.env.VK_SERVICE_TOKEN) {
      const rows = await prisma.post.findMany({
        where: { socialAccountId: this.account.id, postId: { in: postIds } },
        select: { id: true, contentUrl: true },
      });
      const refs = rows
        .map((r) => {
          const m = r.contentUrl.match(/wall(-?\d+)_(\d+)/);
          return m ? { dbId: r.id, ref: `${m[1]}_${m[2]}` } : null;
        })
        .filter((x): x is { dbId: string; ref: string } => Boolean(x));

      for (let i = 0; i < refs.length; i += 100) {
        const batch = refs.slice(i, i + 100);
        const resp = await vkApi<{ items?: VkWallItem[] } | VkWallItem[]>("wall.getById", {
          posts: batch.map((b) => b.ref).join(","),
        });
        const items = Array.isArray(resp) ? resp : resp?.items;
        if (!items) continue;
        const byRef = new Map(batch.map((b) => [b.ref, b.dbId]));
        for (const item of items) {
          const dbId = byRef.get(`${item.owner_id}_${item.id}`);
          if (!dbId) continue;
          const push = (type: "likes" | "comments" | "shares" | "views", value?: number) => {
            if (value != null && value > 0) {
              metrics.push({ postId: dbId, metricType: type, metricDate: today, metricValue: BigInt(value) });
            }
          };
          push("likes", item.likes?.count);
          push("comments", item.comments?.count);
          push("shares", item.reposts?.count);
          // Text/image posts have no video_ext views — VK's wall view
          // counter is the right number for those.
          push("views", item.views?.count);
        }
        await new Promise((r) => setTimeout(r, 350)); // ~3 req/s API limit
      }
      this.logger(`Total ${metrics.length} metric records after wall.getById (official API)`);
    }

    return metrics;
  }

  /**
   * With VK_SERVICE_TOKEN: live member count from groups.getById.
   * Without: fall back to the most recent daily rollup (Mac scraper
   * owns follower counts in that mode).
   */
  async getAccountStats(): Promise<AccountStats> {
    if (process.env.VK_SERVICE_TOKEN) {
      const resp = await vkApi<{ groups?: Array<{ members_count?: number }> } | Array<{ members_count?: number }>>(
        "groups.getById",
        { group_id: this.account.accountId, fields: "members_count" }
      );
      const group = Array.isArray(resp) ? resp[0] : resp?.groups?.[0];
      if (group?.members_count) return { followers: group.members_count };
    }
    const rollup = await prisma.accountDailyRollup.findFirst({
      where: { socialAccountId: this.account.id },
      orderBy: { rollupDate: "desc" },
      select: { totalFollowers: true },
    });
    return {
      followers: rollup ? Number(rollup.totalFollowers) : 0,
    };
  }
}
