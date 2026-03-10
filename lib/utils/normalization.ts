/**
 * Cross-platform metric normalization helpers.
 *
 * Different platforms measure reach differently (YouTube uses "views",
 * Twitter uses "impressions", Instagram uses "reach", etc.). These
 * utilities help produce comparable numbers for side-by-side analysis.
 */

export interface PlatformMetrics {
  platform: string;
  views: number;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  engagements: number;
  engagementRate: number;
  followers: number;
  followerGrowth: number;
  totalPosts: number;
}

export interface NormalizedMetrics extends PlatformMetrics {
  /** Views/impressions/reach collapsed into one comparable number */
  normalizedReach: number;
}

/**
 * Return a single "reach" number per platform, choosing the most
 * representative metric each platform actually reports.
 */
export function normalizedReach(m: PlatformMetrics): number {
  switch (m.platform) {
    case "youtube":
      return m.views;
    case "twitter":
      return m.impressions || m.views;
    case "instagram":
      return m.reach || m.impressions;
    case "tiktok":
      return m.views;
    default:
      return m.views || m.impressions || m.reach;
  }
}

/**
 * Attach a `normalizedReach` field to every platform row.
 */
export function normalizeAll(rows: PlatformMetrics[]): NormalizedMetrics[] {
  return rows.map((r) => ({ ...r, normalizedReach: normalizedReach(r) }));
}

/**
 * Build a compact summary object from an array of per-platform metrics.
 */
export function createComparisonSummary(rows: PlatformMetrics[]) {
  let totalReach = 0;
  let totalEngagements = 0;
  let totalFollowers = 0;
  let totalPosts = 0;

  for (const r of rows) {
    totalReach += normalizedReach(r);
    totalEngagements += r.engagements;
    totalFollowers += r.followers;
    totalPosts += r.totalPosts;
  }

  const avgEngagementRate =
    rows.length > 0
      ? Number(
          (rows.reduce((s, r) => s + r.engagementRate, 0) / rows.length).toFixed(2)
        )
      : 0;

  return {
    totalReach,
    totalEngagements,
    totalFollowers,
    totalPosts,
    avgEngagementRate,
    platformCount: rows.length,
  };
}
