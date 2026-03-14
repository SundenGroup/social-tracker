import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { getLatestMetrics, metricValue } from "@/lib/metrics-helper";
import type { Platform } from "@prisma/client";

const ALL_PLATFORMS: Platform[] = ["youtube", "twitter", "instagram", "tiktok"];

// GET /api/metrics/comparison
export const GET = apiHandler(
  async (req, session) => {
    const url = new URL(req.url);
    const orgId = session!.user.organizationId;
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const profileId = url.searchParams.get("profileId");

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 86400000);

    // Check hideSponsored setting
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { hideSponsored: true },
    });
    const hideSponsored = org?.hideSponsored ?? false;

    // Get all active accounts grouped by platform (optionally filtered by profile)
    const accounts = await prisma.socialAccount.findMany({
      where: { organizationId: orgId, isActive: true, ...(profileId ? { profileId } : {}) },
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

      // Build post filter
      const postWhere: Record<string, unknown> = {
        socialAccountId: { in: accountIds },
        publishedAt: { gte: start, lte: end },
        isDeleted: false,
      };
      if (hideSponsored) {
        postWhere.isSponsored = false;
      }

      // Get posts and latest metrics efficiently
      const posts = await prisma.post.findMany({
        where: postWhere,
        select: { id: true },
      });

      const metricsMap = await getLatestMetrics(posts.map((p) => p.id));

      let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;
      let totalImpressions = 0, totalReach = 0;

      for (const post of posts) {
        totalViews += metricValue(metricsMap, post.id, "views");
        totalLikes += metricValue(metricsMap, post.id, "likes");
        totalComments += metricValue(metricsMap, post.id, "comments");
        totalShares += metricValue(metricsMap, post.id, "shares");
        totalImpressions += metricValue(metricsMap, post.id, "impressions");
        totalReach += metricValue(metricsMap, post.id, "reach");
      }

      const engagements = totalLikes + totalComments + totalShares;
      const base = totalViews || totalImpressions || totalReach || 1;

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
        views: totalViews,
        impressions: totalImpressions,
        reach: totalReach,
        likes: totalLikes,
        comments: totalComments,
        shares: totalShares,
        engagements,
        engagementRate: Number(((engagements / base) * 100).toFixed(2)),
        followers: currentFollowers,
        followerGrowth,
        totalPosts: posts.length,
        accountName,
      });
    }

    // Daily trends per platform — aggregate latest snapshots grouped by publish date
    const trendPostWhere: Record<string, unknown> = {
      socialAccountId: { in: accounts.map((a) => a.id) },
      publishedAt: { gte: start, lte: end },
      isDeleted: false,
    };
    if (hideSponsored) {
      trendPostWhere.isSponsored = false;
    }

    const trendPosts = await prisma.post.findMany({
      where: trendPostWhere,
      select: {
        id: true,
        platform: true,
        publishedAt: true,
      },
    });

    const trendMetrics = await getLatestMetrics(trendPosts.map((p) => p.id));

    const trendMap = new Map<string, Record<string, unknown>>();
    for (const post of trendPosts) {
      const dateKey = post.publishedAt.toISOString().split("T")[0];
      if (!trendMap.has(dateKey)) {
        trendMap.set(dateKey, { date: dateKey });
      }
      const views = metricValue(trendMetrics, post.id, "views");
      if (views > 0) {
        const entry = trendMap.get(dateKey)!;
        entry[post.platform] = ((entry[post.platform] as number) || 0) + views;
      }
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
