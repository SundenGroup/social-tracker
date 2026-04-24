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

  /** Discovery is external (Mac scraper → /api/sync/ingest). Returning []
   *  means the base sync() loop doesn't try to create new posts from here. */
  async fetchPosts(): Promise<PostData[]> {
    this.logger(
      "fetchPosts → no-op; VK discovery happens via the remote Playwright scraper pushing to /api/sync/ingest"
    );
    return [];
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
    return metrics;
  }

  /**
   * Follower count is owned by the Mac scraper (which reads it from the
   * public group page). We fall back to the most recent daily rollup so
   * the base sync() still gets a sensible number for reporting.
   */
  async getAccountStats(): Promise<AccountStats> {
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
