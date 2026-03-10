import type { Platform, MetricType } from "@prisma/client";

interface MetricRecord {
  metricDate: Date;
  metricType: MetricType;
  metricValue: bigint;
}

interface PostRecord {
  publishedAt: Date;
  postType: string;
}

/**
 * Calculate engagement rate as a percentage.
 * engagements / base (views or impressions) * 100
 */
export function calculateEngagementRate(
  base: number,
  engagements: number
): number {
  if (base <= 0) return 0;
  return Number(((engagements / base) * 100).toFixed(2));
}

/**
 * Platform-specific metric normalization factors.
 * Adjusts raw values to allow approximate cross-platform comparison.
 *
 * For video content: Views is the primary metric across all platforms.
 * For non-video content: Impressions/Reach is the primary metric.
 */
const NORMALIZATION_FACTORS: Partial<
  Record<Platform, Partial<Record<MetricType, number>>>
> = {
  youtube: {
    views: 1.0,
    impressions: 1.0,
    engagement_rate: 1.0,
  },
  twitter: {
    views: 1.0,
    impressions: 1.0,
    engagement_rate: 1.2, // Twitter engagement rates tend to be lower
  },
  instagram: {
    views: 1.0,
    impressions: 1.0,
    reach: 1.0,
    engagement_rate: 0.8, // Instagram engagement rates tend to be higher
  },
  tiktok: {
    views: 1.0,
    impressions: 1.0,
    engagement_rate: 0.9,
  },
};

export function normalizeMetricAcrossPlatforms(
  metric: MetricType,
  platform: Platform,
  value: number
): number {
  const factor = NORMALIZATION_FACTORS[platform]?.[metric] ?? 1.0;
  return Number((value * factor).toFixed(2));
}

/**
 * Group metrics by date and sum values for a given metric type.
 */
export function aggregateMetricsByDate(
  metrics: MetricRecord[]
): { date: Date; total: number }[] {
  const grouped = new Map<string, { date: Date; total: number }>();

  for (const metric of metrics) {
    const key = metric.metricDate.toISOString().split("T")[0];
    const existing = grouped.get(key);
    const value = Number(metric.metricValue);

    if (existing) {
      existing.total += value;
    } else {
      grouped.set(key, { date: metric.metricDate, total: value });
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
}

/**
 * Calculate a daily rollup from posts and their metrics for a given date.
 */
export function calculateDailyRollup(
  posts: PostRecord[],
  metrics: MetricRecord[]
): {
  totalViews: bigint;
  totalLikes: bigint;
  totalComments: bigint;
  totalShares: bigint;
  totalImpressions: bigint;
  totalReach: bigint;
  engagementRate: number;
  postsPublished: number;
} {
  const sums: Record<string, bigint> = {
    views: 0n,
    likes: 0n,
    comments: 0n,
    shares: 0n,
    impressions: 0n,
    reach: 0n,
  };

  for (const metric of metrics) {
    const type = metric.metricType;
    if (type in sums) {
      sums[type] += metric.metricValue;
    }
  }

  const engagements =
    Number(sums.likes) + Number(sums.comments) + Number(sums.shares);
  const base = Number(sums.views) || Number(sums.impressions);

  return {
    totalViews: sums.views,
    totalLikes: sums.likes,
    totalComments: sums.comments,
    totalShares: sums.shares,
    totalImpressions: sums.impressions,
    totalReach: sums.reach,
    engagementRate: calculateEngagementRate(base, engagements),
    postsPublished: posts.length,
  };
}
