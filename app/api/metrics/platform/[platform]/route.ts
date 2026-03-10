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

    // Build post performance list
    const postPerformance = posts.map((post) => {
      const pm = post.metrics;
      const sumOf = (type: string) =>
        pm.filter((m) => m.metricType === type).reduce((s, m) => s + Number(m.metricValue), 0);

      const views = sumOf("views");
      const likes = sumOf("likes");
      const comments = sumOf("comments");
      const shares = sumOf("shares");
      const impressions = sumOf("impressions");
      const reach = sumOf("reach");
      const watchDuration = sumOf("watch_duration");
      const engagements = likes + comments + shares;
      const base = views || impressions || 1;

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
        engagementRate: Number(((engagements / base) * 100).toFixed(2)),
      };
    });

    // Aggregated metrics
    const metricAgg = await prisma.postMetric.groupBy({
      by: ["metricType"],
      where: {
        socialAccountId: { in: accountIds },
        metricDate: { gte: start, lte: end },
      },
      _sum: { metricValue: true },
    });

    const metricTotals: Record<string, number> = {};
    for (const m of metricAgg) {
      metricTotals[m.metricType] = Number(m._sum.metricValue ?? 0);
    }

    const totalViews = metricTotals["views"] ?? 0;
    const totalLikes = metricTotals["likes"] ?? 0;
    const totalComments = metricTotals["comments"] ?? 0;
    const totalShares = metricTotals["shares"] ?? 0;
    const totalImpressions = metricTotals["impressions"] ?? 0;
    const totalReach = metricTotals["reach"] ?? 0;
    const totalEngagements = totalLikes + totalComments + totalShares;
    const engBase = totalViews || totalImpressions || 1;

    // Daily trend data (multiple metric types)
    const dailyMetrics = await prisma.postMetric.groupBy({
      by: ["metricDate", "metricType"],
      where: {
        socialAccountId: { in: accountIds },
        metricDate: { gte: start, lte: end },
        metricType: { in: ["views", "likes", "comments", "shares", "impressions", "reach"] },
      },
      _sum: { metricValue: true },
      orderBy: { metricDate: "asc" },
    });

    const trendMap = new Map<string, Record<string, number>>();
    for (const dm of dailyMetrics) {
      const dateKey = dm.metricDate.toISOString().split("T")[0];
      if (!trendMap.has(dateKey)) {
        trendMap.set(dateKey, { date: 0 } as unknown as Record<string, number>);
        (trendMap.get(dateKey)! as Record<string, unknown>).date = dateKey;
      }
      const entry = trendMap.get(dateKey)!;
      entry[dm.metricType] = Number(dm._sum.metricValue ?? 0);
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

    return NextResponse.json({
      data: {
        summary: {
          totalViews,
          totalLikes,
          totalComments,
          totalShares,
          totalImpressions,
          totalReach,
          avgEngagementRate: Number(((totalEngagements / engBase) * 100).toFixed(2)),
          totalPosts: posts.length,
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
