import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import type { Platform } from "@prisma/client";

const ALL_PLATFORMS: Platform[] = ["youtube", "twitter", "instagram", "tiktok"];

// GET /api/metrics/comparison
export const GET = apiHandler(
  async (req, session) => {
    const url = new URL(req.url);
    const orgId = session!.user.organizationId;
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 86400000);

    // Get all active accounts grouped by platform
    const accounts = await prisma.socialAccount.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, platform: true, accountName: true },
    });

    const accountsByPlatform = new Map<Platform, string[]>();
    for (const a of accounts) {
      const ids = accountsByPlatform.get(a.platform) ?? [];
      ids.push(a.id);
      accountsByPlatform.set(a.platform, ids);
    }

    // Build per-platform metrics
    const platformRows = [];

    for (const platform of ALL_PLATFORMS) {
      const accountIds = accountsByPlatform.get(platform) ?? [];

      if (accountIds.length === 0) {
        platformRows.push({
          platform,
          views: 0,
          impressions: 0,
          reach: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          engagements: 0,
          engagementRate: 0,
          followers: 0,
          followerGrowth: 0,
          totalPosts: 0,
          accountName: null,
        });
        continue;
      }

      // Aggregate metrics
      const metricAgg = await prisma.postMetric.groupBy({
        by: ["metricType"],
        where: {
          socialAccountId: { in: accountIds },
          metricDate: { gte: start, lte: end },
        },
        _sum: { metricValue: true },
      });

      const totals: Record<string, number> = {};
      for (const m of metricAgg) {
        totals[m.metricType] = Number(m._sum.metricValue ?? 0);
      }

      const views = totals["views"] ?? 0;
      const likes = totals["likes"] ?? 0;
      const comments = totals["comments"] ?? 0;
      const shares = totals["shares"] ?? 0;
      const impressions = totals["impressions"] ?? 0;
      const reach = totals["reach"] ?? 0;
      const engagements = likes + comments + shares;
      const base = views || impressions || reach || 1;

      // Post count
      const postCount = await prisma.post.count({
        where: {
          socialAccountId: { in: accountIds },
          publishedAt: { gte: start, lte: end },
          isDeleted: false,
        },
      });

      // Follower data from daily rollups
      const latestRollup = await prisma.accountDailyRollup.findFirst({
        where: { socialAccountId: { in: accountIds } },
        orderBy: { rollupDate: "desc" },
        select: { totalFollowers: true },
      });

      const earliestRollup = await prisma.accountDailyRollup.findFirst({
        where: {
          socialAccountId: { in: accountIds },
          rollupDate: { gte: start },
        },
        orderBy: { rollupDate: "asc" },
        select: { totalFollowers: true },
      });

      const currentFollowers = Number(latestRollup?.totalFollowers ?? 0);
      const startFollowers = Number(earliestRollup?.totalFollowers ?? 0);
      const followerGrowth = currentFollowers - startFollowers;

      const accountName = accounts
        .filter((a) => a.platform === platform)
        .map((a) => a.accountName)
        .join(", ");

      platformRows.push({
        platform,
        views,
        impressions,
        reach,
        likes,
        comments,
        shares,
        engagements,
        engagementRate: Number(((engagements / base) * 100).toFixed(2)),
        followers: currentFollowers,
        followerGrowth,
        totalPosts: postCount,
        accountName,
      });
    }

    // Daily trends per platform (views/impressions)
    const allAccountIds = accounts.map((a) => a.id);
    const dailyMetrics = await prisma.postMetric.groupBy({
      by: ["metricDate", "platform"],
      where: {
        socialAccountId: { in: allAccountIds },
        metricDate: { gte: start, lte: end },
        metricType: "views",
      },
      _sum: { metricValue: true },
      orderBy: { metricDate: "asc" },
    });

    const trendMap = new Map<string, Record<string, unknown>>();
    for (const dm of dailyMetrics) {
      const dateKey = dm.metricDate.toISOString().split("T")[0];
      if (!trendMap.has(dateKey)) {
        trendMap.set(dateKey, { date: dateKey });
      }
      trendMap.get(dateKey)![dm.platform] = Number(dm._sum.metricValue ?? 0);
    }

    // Engagement distribution for pie chart
    const engagementDistribution = platformRows
      .filter((r) => r.engagements > 0)
      .map((r) => ({
        name: r.platform.charAt(0).toUpperCase() + r.platform.slice(1),
        value: r.engagements,
        color: platformColor(r.platform),
      }));

    // Content volume per platform
    const contentVolume = platformRows.map((r) => ({
      name: r.platform.charAt(0).toUpperCase() + r.platform.slice(1),
      value: r.totalPosts,
    }));

    return NextResponse.json({
      data: {
        platforms: platformRows,
        trends: Array.from(trendMap.values()),
        engagementDistribution,
        contentVolume,
      },
    });
  },
  { requireAuth: true }
);

function platformColor(platform: string): string {
  switch (platform) {
    case "youtube": return "#FF0000";
    case "twitter": return "#1DA1F2";
    case "instagram": return "#E4405F";
    case "tiktok": return "#000000";
    default: return "#666666";
  }
}
