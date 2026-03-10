import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";

// GET /api/metrics/dashboard - Aggregated dashboard data
export const GET = apiHandler(
  async (req, session) => {
    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const orgId = session!.user.organizationId;

    // Default: last 30 days
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 86400000);

    // Get all accounts for org
    const accounts = await prisma.socialAccount.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, platform: true, accountName: true, syncStatus: true, lastSyncedAt: true },
    });

    const accountIds = accounts.map((a) => a.id);

    // Get aggregated metrics per platform
    const metrics = await prisma.postMetric.groupBy({
      by: ["socialAccountId", "metricType"],
      where: {
        socialAccountId: { in: accountIds },
        metricDate: { gte: start, lte: end },
      },
      _sum: { metricValue: true },
    });

    // Build per-platform summaries
    const platformMap = new Map<string, { views: bigint; likes: bigint; comments: bigint; shares: bigint; impressions: bigint }>();

    for (const account of accounts) {
      if (!platformMap.has(account.platform)) {
        platformMap.set(account.platform, {
          views: 0n, likes: 0n, comments: 0n, shares: 0n, impressions: 0n,
        });
      }
    }

    for (const m of metrics) {
      const account = accounts.find((a) => a.id === m.socialAccountId);
      if (!account) continue;
      const platform = platformMap.get(account.platform);
      if (!platform) continue;

      const val = m._sum.metricValue ?? 0n;
      switch (m.metricType) {
        case "views": platform.views += val; break;
        case "likes": platform.likes += val; break;
        case "comments": platform.comments += val; break;
        case "shares": platform.shares += val; break;
        case "impressions": platform.impressions += val; break;
      }
    }

    // Get top posts per platform
    const topPosts = await prisma.post.findMany({
      where: {
        socialAccountId: { in: accountIds },
        publishedAt: { gte: start, lte: end },
      },
      include: {
        metrics: {
          where: { metricDate: { gte: start, lte: end } },
        },
      },
      orderBy: { publishedAt: "desc" },
      take: 100,
    });

    // Build post performance list
    const postPerformance = topPosts.map((post) => {
      const postMetrics = post.metrics;
      const views = postMetrics.filter((m) => m.metricType === "views").reduce((s, m) => s + Number(m.metricValue), 0);
      const likes = Number(postMetrics.filter((m) => m.metricType === "likes").reduce((s, m) => s + Number(m.metricValue), 0));
      const comments = Number(postMetrics.filter((m) => m.metricType === "comments").reduce((s, m) => s + Number(m.metricValue), 0));
      const shares = Number(postMetrics.filter((m) => m.metricType === "shares").reduce((s, m) => s + Number(m.metricValue), 0));
      const impressions = Number(postMetrics.filter((m) => m.metricType === "impressions").reduce((s, m) => s + Number(m.metricValue), 0));
      const base = views || impressions || 1;
      const engagements = likes + comments + shares;

      return {
        id: post.id,
        platform: post.platform,
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
        engagementRate: Number(((engagements / base) * 100).toFixed(2)),
      };
    });

    // Build daily trend data
    const dailyMetrics = await prisma.postMetric.groupBy({
      by: ["metricDate", "platform"],
      where: {
        socialAccountId: { in: accountIds },
        metricDate: { gte: start, lte: end },
        metricType: "views",
      },
      _sum: { metricValue: true },
      orderBy: { metricDate: "asc" },
    });

    const trendMap = new Map<string, Record<string, number>>();
    for (const dm of dailyMetrics) {
      const dateKey = dm.metricDate.toISOString().split("T")[0];
      if (!trendMap.has(dateKey)) {
        trendMap.set(dateKey, { date: dateKey } as unknown as Record<string, number>);
      }
      const entry = trendMap.get(dateKey)!;
      entry[dm.platform] = Number(dm._sum.metricValue ?? 0);
    }

    // Build totals
    let totalViews = 0n;
    let totalLikes = 0n;
    let totalComments = 0n;
    let totalShares = 0n;
    let totalImpressions = 0n;

    for (const p of platformMap.values()) {
      totalViews += p.views;
      totalLikes += p.likes;
      totalComments += p.comments;
      totalShares += p.shares;
      totalImpressions += p.impressions;
    }

    const totalEngagements = Number(totalLikes + totalComments + totalShares);
    const base = Number(totalViews) || Number(totalImpressions) || 1;

    // Platform summaries for cards
    const platformSummaries = Array.from(platformMap.entries()).map(
      ([platform, m]) => {
        const topPost = postPerformance
          .filter((p) => p.platform === platform)
          .sort((a, b) => b.views - a.views)[0];
        return {
          platform,
          views: Number(m.views),
          engagements:
            Number(m.likes) + Number(m.comments) + Number(m.shares),
          topPost: topPost?.title ?? null,
        };
      }
    );

    return NextResponse.json({
      data: {
        summary: {
          totalViews: Number(totalViews),
          totalEngagements,
          avgEngagementRate: Number(
            ((totalEngagements / base) * 100).toFixed(2)
          ),
          totalImpressions: Number(totalImpressions),
        },
        platforms: platformSummaries,
        posts: postPerformance,
        trends: Array.from(trendMap.values()),
        accounts: accounts.map((a) => ({
          id: a.id,
          platform: a.platform,
          accountName: a.accountName,
          syncStatus: a.syncStatus,
          lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
        })),
      },
    });
  },
  { requireAuth: true }
);
