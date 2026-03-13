import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import type { Platform, PostType } from "@prisma/client";

const ALL_PLATFORMS: Platform[] = ["youtube", "twitter", "instagram", "tiktok"];

interface PeriodPlatformRow {
  platform: string;
  views: number;
  engagements: number;
  engagementRate: number;
  posts: number;
}

interface PeriodSummary {
  label: string;
  summary: {
    totalViews: number;
    totalEngagements: number;
    avgEngagementRate: number;
    totalPosts: number;
  };
  platforms: PeriodPlatformRow[];
  dailyTrend: { day: number; views: number }[];
}

function formatLabel(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function buildPostTypeFilter(contentType: string | null): Record<string, unknown> {
  if (contentType === "video") {
    return { postType: { in: ["video", "short"] as PostType[] } };
  } else if (contentType === "short-form") {
    return {
      OR: [
        { postType: "short" },
        { platform: "tiktok", postType: "video" },
        { platform: "instagram", postType: "video" },
      ],
    };
  } else if (contentType === "long-form") {
    return { platform: "youtube", postType: "video" };
  } else if (contentType === "image") {
    return { postType: "image" };
  }
  return {};
}

async function aggregatePeriod(
  accountIds: string[],
  start: Date,
  end: Date,
  hideSponsored: boolean,
  postTypeFilter: Record<string, unknown>
): Promise<PeriodSummary> {
  const accountsByPlatform = new Map<Platform, string[]>();

  const accounts = await prisma.socialAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, platform: true },
  });

  for (const a of accounts) {
    const ids = accountsByPlatform.get(a.platform) ?? [];
    ids.push(a.id);
    accountsByPlatform.set(a.platform, ids);
  }

  const platformRows: PeriodPlatformRow[] = [];

  for (const platform of ALL_PLATFORMS) {
    const platAccountIds = accountsByPlatform.get(platform) ?? [];

    if (platAccountIds.length === 0) {
      platformRows.push({ platform, views: 0, engagements: 0, engagementRate: 0, posts: 0 });
      continue;
    }

    const postWhere: Record<string, unknown> = {
      socialAccountId: { in: platAccountIds },
      publishedAt: { gte: start, lte: end },
      isDeleted: false,
      ...postTypeFilter,
    };
    if (hideSponsored) postWhere.isSponsored = false;

    const posts = await prisma.post.findMany({
      where: postWhere,
      include: {
        metrics: {
          where: { metricDate: { gte: start, lte: end } },
        },
      },
    });

    let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;

    for (const post of posts) {
      const latestOf = (type: string) => {
        const records = post.metrics.filter((m) => m.metricType === type);
        if (records.length === 0) return 0;
        const latest = records.reduce((a, b) =>
          a.metricDate.getTime() > b.metricDate.getTime() ? a : b
        );
        return Number(latest.metricValue);
      };

      totalViews += latestOf("views");
      totalLikes += latestOf("likes");
      totalComments += latestOf("comments");
      totalShares += latestOf("shares");
    }

    const engagements = totalLikes + totalComments + totalShares;
    const base = totalViews || 1;

    platformRows.push({
      platform,
      views: totalViews,
      engagements,
      engagementRate: Number(((engagements / base) * 100).toFixed(2)),
      posts: posts.length,
    });
  }

  // Daily trend: group views by day offset from period start
  const allPostWhere: Record<string, unknown> = {
    socialAccountId: { in: accountIds },
    publishedAt: { gte: start, lte: end },
    isDeleted: false,
    ...postTypeFilter,
  };
  if (hideSponsored) allPostWhere.isSponsored = false;

  const trendPosts = await prisma.post.findMany({
    where: allPostWhere,
    select: {
      publishedAt: true,
      metrics: {
        where: { metricDate: { gte: start, lte: end }, metricType: "views" },
      },
    },
  });

  const startTime = start.getTime();
  const dayMap = new Map<number, number>();

  for (const post of trendPosts) {
    const dayOffset = Math.floor((post.publishedAt.getTime() - startTime) / 86400000);
    const viewRecords = post.metrics;
    if (viewRecords.length > 0) {
      const latest = viewRecords.reduce((a, b) =>
        a.metricDate.getTime() > b.metricDate.getTime() ? a : b
      );
      dayMap.set(dayOffset, (dayMap.get(dayOffset) ?? 0) + Number(latest.metricValue));
    }
  }

  const totalDays = Math.ceil((end.getTime() - startTime) / 86400000) + 1;
  const dailyTrend: { day: number; views: number }[] = [];
  for (let d = 0; d < totalDays; d++) {
    dailyTrend.push({ day: d + 1, views: dayMap.get(d) ?? 0 });
  }

  // Compute summary
  const totalViews = platformRows.reduce((s, p) => s + p.views, 0);
  const totalEngagements = platformRows.reduce((s, p) => s + p.engagements, 0);
  const totalPosts = platformRows.reduce((s, p) => s + p.posts, 0);
  const activePlatforms = platformRows.filter((p) => p.posts > 0);
  const avgEngagementRate =
    activePlatforms.length > 0
      ? Number(
          (activePlatforms.reduce((s, p) => s + p.engagementRate, 0) / activePlatforms.length).toFixed(2)
        )
      : 0;

  return {
    label: formatLabel(start, end),
    summary: { totalViews, totalEngagements, avgEngagementRate, totalPosts },
    platforms: platformRows,
    dailyTrend,
  };
}

function pctChange(a: number, b: number): number {
  if (b === 0) return a > 0 ? 100 : 0;
  return Number((((a - b) / b) * 100).toFixed(1));
}

// GET /api/metrics/period-comparison
export const GET = apiHandler(
  async (req, session) => {
    const url = new URL(req.url);
    const orgId = session!.user.organizationId;
    const profileId = url.searchParams.get("profileId");
    const contentType = url.searchParams.get("contentType");
    const startDateA = url.searchParams.get("startDateA");
    const endDateA = url.searchParams.get("endDateA");
    const startDateB = url.searchParams.get("startDateB");
    const endDateB = url.searchParams.get("endDateB");

    const now = new Date();
    const endA = endDateA ? new Date(endDateA) : now;
    const startA = startDateA ? new Date(startDateA) : new Date(endA.getTime() - 30 * 86400000);
    const endB = endDateB ? new Date(endDateB) : new Date(endA.getTime() - 365 * 86400000);
    const startB = startDateB ? new Date(startDateB) : new Date(startA.getTime() - 365 * 86400000);

    // Check hideSponsored setting
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { hideSponsored: true },
    });
    const hideSponsored = org?.hideSponsored ?? false;

    // Get account IDs
    const accounts = await prisma.socialAccount.findMany({
      where: { organizationId: orgId, isActive: true, ...(profileId ? { profileId } : {}) },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);
    const postTypeFilter = buildPostTypeFilter(contentType);

    // Aggregate both periods in parallel
    const [periodA, periodB] = await Promise.all([
      aggregatePeriod(accountIds, startA, endA, hideSponsored, postTypeFilter),
      aggregatePeriod(accountIds, startB, endB, hideSponsored, postTypeFilter),
    ]);

    // Compute changes
    const changes = {
      views: pctChange(periodA.summary.totalViews, periodB.summary.totalViews),
      engagements: pctChange(periodA.summary.totalEngagements, periodB.summary.totalEngagements),
      engagementRate: Number(
        (periodA.summary.avgEngagementRate - periodB.summary.avgEngagementRate).toFixed(2)
      ),
      posts: pctChange(periodA.summary.totalPosts, periodB.summary.totalPosts),
      platforms: ALL_PLATFORMS.map((platform) => {
        const a = periodA.platforms.find((p) => p.platform === platform)!;
        const b = periodB.platforms.find((p) => p.platform === platform)!;
        return {
          platform,
          views: pctChange(a.views, b.views),
          engagements: pctChange(a.engagements, b.engagements),
          engagementRate: Number((a.engagementRate - b.engagementRate).toFixed(2)),
          posts: pctChange(a.posts, b.posts),
        };
      }),
    };

    return NextResponse.json({ data: { periodA, periodB, changes } });
  },
  { requireAuth: true }
);
