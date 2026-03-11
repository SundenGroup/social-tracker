import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import type { Platform } from "@prisma/client";

const VALID_PLATFORMS = ["youtube", "twitter", "instagram", "tiktok"] as const;

// GET /api/metrics/platform/[platform]
export const GET = apiHandler(
  async (req, session) => {
    const url = new URL(req.url);
    const platform = url.pathname.split("/").pop() as string;

    if (!VALID_PLATFORMS.includes(platform as Platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    const orgId = session!.user.organizationId;
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const contentType = url.searchParams.get("contentType"); // e.g. "short", "video", "image"

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 86400000);

    // Get accounts for this platform
    const accounts = await prisma.socialAccount.findMany({
      where: { organizationId: orgId, platform: platform as Platform, isActive: true },
      select: { id: true, accountName: true, syncStatus: true, lastSyncedAt: true },
    });

    const accountIds = accounts.map((a) => a.id);

    if (accountIds.length === 0) {
      return NextResponse.json({
        data: {
          summary: { totalViews: 0, totalLikes: 0, totalComments: 0, totalShares: 0, totalImpressions: 0, totalReach: 0, avgEngagementRate: 0, totalPosts: 0 },
          posts: [],
          trends: [],
          engagementBreakdown: [],
          topPosts: [],
        },
      });
    }

    // Build post filter
    const postWhere: Record<string, unknown> = {
      socialAccountId: { in: accountIds },
      publishedAt: { gte: start, lte: end },
      isDeleted: false,
    };
    if (contentType && contentType !== "all") {
      postWhere.postType = contentType;
    }

    // Get posts with metrics
    const posts = await prisma.post.findMany({
      where: postWhere,
      include: {
        metrics: {
          where: { metricDate: { gte: start, lte: end } },
        },
      },
      orderBy: { publishedAt: "desc" },
      take: 200,
    });

    // Build post performance list — use LATEST metric snapshot, not sum across dates
    const postPerformance = posts.map((post) => {
      const pm = post.metrics;
      const latestOf = (type: string) => {
        const records = pm.filter((m) => m.metricType === type);
        if (records.length === 0) return 0;
        const latest = records.reduce((a, b) =>
          a.metricDate.getTime() > b.metricDate.getTime() ? a : b
        );
        return Number(latest.metricValue);
      };

      const views = latestOf("views");
      const likes = latestOf("likes");
      const comments = latestOf("comments");
      const shares = latestOf("shares");
      const impressions = latestOf("impressions");
      const reach = latestOf("reach");
      const watchDuration = latestOf("watch_duration");
      const engagements = likes + comments + shares;
      // Only compute engagement rate when we have a meaningful denominator
      // (Instagram images have no views — showing 0% instead of absurd 1000%+)
      const base = views || impressions || 0;
      const engagementRate = base > 0 ? Number(((engagements / base) * 100).toFixed(2)) : 0;

      return {
        id: post.id,
        postType: post.postType,
        title: post.title,
        contentUrl: post.contentUrl,
        thumbnailUrl: post.thumbnailUrl,
        publishedAt: post.publishedAt.toISOString(),
        isTrending: post.isTrending,
        views,
        likes,
        comments,
        shares,
        impressions,
        reach,
        watchDuration,
        engagements,
        engagementRate,
      };
    });

    // Summary: use the latest date's snapshot (not sum across dates)
    const latestMetricDate = await prisma.postMetric.findFirst({
      where: { socialAccountId: { in: accountIds }, metricDate: { gte: start, lte: end } },
      orderBy: { metricDate: "desc" },
      select: { metricDate: true },
    });

    let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;
    let totalImpressions = 0, totalReach = 0;

    if (latestMetricDate) {
      const metricAgg = await prisma.postMetric.groupBy({
        by: ["metricType"],
        where: {
          socialAccountId: { in: accountIds },
          metricDate: latestMetricDate.metricDate,
        },
        _sum: { metricValue: true },
      });

      for (const m of metricAgg) {
        const val = Number(m._sum.metricValue ?? 0);
        switch (m.metricType) {
          case "views": totalViews = val; break;
          case "likes": totalLikes = val; break;
          case "comments": totalComments = val; break;
          case "shares": totalShares = val; break;
          case "impressions": totalImpressions = val; break;
          case "reach": totalReach = val; break;
        }
      }
    }

    const totalEngagements = totalLikes + totalComments + totalShares;
    const engBase = totalViews || totalImpressions || 0;

    // Daily trend data — compute day-over-day DELTAS instead of cumulative totals
    // Fetch one extra day before start so we can compute the delta for the first day
    const dayBeforeStart = new Date(start.getTime() - 86400000);
    const dailyMetrics = await prisma.postMetric.groupBy({
      by: ["metricDate", "metricType"],
      where: {
        socialAccountId: { in: accountIds },
        metricDate: { gte: dayBeforeStart, lte: end },
        metricType: { in: ["views", "likes", "comments", "shares", "impressions", "reach"] },
      },
      _sum: { metricValue: true },
      orderBy: { metricDate: "asc" },
    });

    // Group cumulative totals by metric type
    const cumulativeByType: Record<string, { date: string; total: number }[]> = {};
    for (const dm of dailyMetrics) {
      const type = dm.metricType;
      if (!cumulativeByType[type]) cumulativeByType[type] = [];
      cumulativeByType[type].push({
        date: dm.metricDate.toISOString().split("T")[0],
        total: Number(dm._sum.metricValue ?? 0),
      });
    }

    // Compute daily deltas
    const startStr = start.toISOString().split("T")[0];
    const trendMap = new Map<string, Record<string, number>>();
    for (const [type, entries] of Object.entries(cumulativeByType)) {
      entries.sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 1; i < entries.length; i++) {
        const date = entries[i].date;
        if (date < startStr) continue; // skip the extra baseline day
        const delta = Math.max(0, entries[i].total - entries[i - 1].total);
        if (!trendMap.has(date)) {
          trendMap.set(date, { date } as unknown as Record<string, number>);
        }
        trendMap.get(date)![type] = delta;
      }
    }

    // Engagement breakdown for pie chart
    const engagementBreakdown = [
      { name: "Likes", value: totalLikes, color: "#FF154D" },
      { name: "Comments", value: totalComments, color: "#121B6C" },
      { name: "Shares", value: totalShares, color: "#1DA1F2" },
    ].filter((d) => d.value > 0);

    // Top posts by views (for bar chart)
    const topPosts = [...postPerformance]
      .sort((a, b) => b.views - a.views)
      .slice(0, 10)
      .map((p) => ({
        name: (p.title ?? "Untitled").slice(0, 40),
        value: p.views,
        id: p.id,
      }));

    // Account stats from AccountDailyRollup
    const latestRollups = await prisma.accountDailyRollup.findMany({
      where: { socialAccountId: { in: accountIds } },
      orderBy: { rollupDate: "desc" },
      distinct: ["socialAccountId"],
      select: { totalFollowers: true, socialAccountId: true },
    });

    const earliestRollups = await prisma.accountDailyRollup.findMany({
      where: {
        socialAccountId: { in: accountIds },
        rollupDate: { gte: start, lte: end },
      },
      orderBy: { rollupDate: "asc" },
      distinct: ["socialAccountId"],
      select: { totalFollowers: true, socialAccountId: true },
    });

    let totalFollowers = 0;
    let followerGrowth = 0;

    for (const latest of latestRollups) {
      totalFollowers += Number(latest.totalFollowers);
      const earliest = earliestRollups.find((e) => e.socialAccountId === latest.socialAccountId);
      if (earliest && Number(earliest.totalFollowers) > 0) {
        followerGrowth += Number(latest.totalFollowers) - Number(earliest.totalFollowers);
      }
    }

    return NextResponse.json({
      data: {
        summary: {
          totalViews,
          totalLikes,
          totalComments,
          totalShares,
          totalImpressions,
          totalReach,
          avgEngagementRate: engBase > 0 ? Number(((totalEngagements / engBase) * 100).toFixed(2)) : 0,
          totalPosts: posts.length,
        },
        accountStats: {
          totalFollowers,
          followerGrowth,
        },
        posts: postPerformance,
        trends: Array.from(trendMap.values()),
        engagementBreakdown,
        topPosts,
        accounts: accounts.map((a) => ({
          id: a.id,
          accountName: a.accountName,
          syncStatus: a.syncStatus,
          lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
        })),
      },
    });
  },
  { requireAuth: true }
);
