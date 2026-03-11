import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";

// GET /api/metrics/dashboard - Aggregated dashboard data
export const GET = apiHandler(
  async (req, session) => {
    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const contentType = url.searchParams.get("contentType");

    const orgId = session!.user.organizationId;

    // Default: last 30 days
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

    // Get all accounts for org
    const accounts = await prisma.socialAccount.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, platform: true, accountName: true, syncStatus: true, lastSyncedAt: true },
    });

    const accountIds = accounts.map((a) => a.id);

    // Build optional postType filter
    const postTypeFilter = contentType && contentType !== "all"
      ? { postType: contentType as import("@prisma/client").PostType }
      : {};

    // Build sponsored filter for aggregation queries
    const sponsoredFilter = hideSponsored ? { isSponsored: false } : {};

    // Get ALL posts (including sponsored) for the table
    const topPosts = await prisma.post.findMany({
      where: {
        socialAccountId: { in: accountIds },
        publishedAt: { gte: start, lte: end },
        isDeleted: false,
        ...postTypeFilter,
      },
      include: {
        metrics: {
          where: { metricDate: { gte: start, lte: end } },
        },
      },
      orderBy: { publishedAt: "desc" },
    });

    const postDbIds = topPosts.map((p) => p.id);
    // IDs for aggregation (excludes sponsored if hideSponsored)
    const aggPostIds = hideSponsored
      ? topPosts.filter((p) => !p.isSponsored).map((p) => p.id)
      : postDbIds;

    // Build per-platform summaries scoped to posts published in the date range
    const platformMap = new Map<string, { views: bigint; likes: bigint; comments: bigint; shares: bigint; impressions: bigint }>();

    for (const account of accounts) {
      if (!platformMap.has(account.platform)) {
        platformMap.set(account.platform, {
          views: 0n, likes: 0n, comments: 0n, shares: 0n, impressions: 0n,
        });
      }
    }

    if (aggPostIds.length > 0) {
      const latestMetricDate = await prisma.postMetric.findFirst({
        where: { postId: { in: aggPostIds }, metricDate: { gte: start, lte: end } },
        orderBy: { metricDate: "desc" },
        select: { metricDate: true },
      });

      if (latestMetricDate) {
        const metrics = await prisma.postMetric.groupBy({
          by: ["socialAccountId", "metricType"],
          where: {
            postId: { in: aggPostIds },
            metricDate: latestMetricDate.metricDate,
          },
          _sum: { metricValue: true },
        });

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
      }
    }

    // Build post performance list — use LATEST metric snapshot, not sum across dates
    const postPerformance = topPosts.map((post) => {
      const postMetrics = post.metrics;
      const latestOf = (type: string) => {
        const records = postMetrics.filter((m) => m.metricType === type);
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
      const base = views || impressions || 0;
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
        isSponsored: post.isSponsored,
        views,
        likes,
        comments,
        shares,
        impressions,
        engagementRate: base > 0 ? Number(((engagements / base) * 100).toFixed(2)) : 0,
      };
    });

    // Build trend data: aggregate views by publish date, grouped by platform
    // Exclude sponsored posts from trends when hideSponsored is on
    const trendPosts = hideSponsored
      ? postPerformance.filter((p) => !p.isSponsored)
      : postPerformance;
    const trendMap = new Map<string, Record<string, number>>();
    for (const post of trendPosts) {
      const date = post.publishedAt.split("T")[0];
      if (!trendMap.has(date)) {
        trendMap.set(date, { date } as unknown as Record<string, number>);
      }
      const entry = trendMap.get(date)!;
      entry[post.platform] = (entry[post.platform] || 0) + post.views;
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
    const base = Number(totalViews) || Number(totalImpressions) || 0;

    // Previous period comparison
    const rangeDuration = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1); // day before current start
    const prevStart = new Date(prevEnd.getTime() - rangeDuration);

    const prevPosts = await prisma.post.findMany({
      where: {
        socialAccountId: { in: accountIds },
        publishedAt: { gte: prevStart, lte: prevEnd },
        isDeleted: false,
        ...postTypeFilter,
        ...sponsoredFilter,
      },
      select: { id: true },
    });

    const prevPostIds = prevPosts.map((p) => p.id);
    let prevViews = 0;
    let prevEngagements = 0;
    let prevEngRate = 0;

    if (prevPostIds.length > 0) {
      const prevLatestMetric = await prisma.postMetric.findFirst({
        where: { postId: { in: prevPostIds } },
        orderBy: { metricDate: "desc" },
        select: { metricDate: true },
      });

      if (prevLatestMetric) {
        const prevAgg = await prisma.postMetric.groupBy({
          by: ["metricType"],
          where: {
            postId: { in: prevPostIds },
            metricDate: prevLatestMetric.metricDate,
          },
          _sum: { metricValue: true },
        });

        let pv = 0, pl = 0, pc = 0, ps = 0, pi = 0;
        for (const m of prevAgg) {
          const val = Number(m._sum.metricValue ?? 0);
          switch (m.metricType) {
            case "views": pv = val; break;
            case "likes": pl = val; break;
            case "comments": pc = val; break;
            case "shares": ps = val; break;
            case "impressions": pi = val; break;
          }
        }
        prevViews = pv;
        prevEngagements = pl + pc + ps;
        const prevBase = pv || pi || 0;
        prevEngRate = prevBase > 0 ? Number(((prevEngagements / prevBase) * 100).toFixed(2)) : 0;
      }
    }

    const pctChange = (curr: number, prev: number) =>
      prev > 0 ? Number((((curr - prev) / prev) * 100).toFixed(1)) : curr > 0 ? 100 : 0;

    const comparison = {
      views: pctChange(Number(totalViews), prevViews),
      engagements: pctChange(totalEngagements, prevEngagements),
      engagementRate: pctChange(
        base > 0 ? Number(((totalEngagements / base) * 100).toFixed(2)) : 0,
        prevEngRate
      ),
    };

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

    // Build per-account follower map
    const followersByAccount = new Map<string, { total: number; growth: number }>();
    for (const latest of latestRollups) {
      const earliest = earliestRollups.find((e) => e.socialAccountId === latest.socialAccountId);
      const growth = earliest && Number(earliest.totalFollowers) > 0
        ? Number(latest.totalFollowers) - Number(earliest.totalFollowers)
        : 0;
      followersByAccount.set(latest.socialAccountId, {
        total: Number(latest.totalFollowers),
        growth,
      });
    }

    let totalFollowers = 0;
    let totalFollowerGrowth = 0;
    for (const f of followersByAccount.values()) {
      totalFollowers += f.total;
      totalFollowerGrowth += f.growth;
    }

    // Platform summaries for cards
    const platformSummaries = Array.from(platformMap.entries()).map(
      ([platform, m]) => {
        const topPost = postPerformance
          .filter((p) => p.platform === platform)
          .sort((a, b) => b.views - a.views)[0];

        // Sum followers for accounts on this platform
        let platFollowers = 0;
        let platFollowerGrowth = 0;
        for (const account of accounts.filter((a) => a.platform === platform)) {
          const f = followersByAccount.get(account.id);
          if (f) {
            platFollowers += f.total;
            platFollowerGrowth += f.growth;
          }
        }

        return {
          platform,
          views: Number(m.views),
          engagements:
            Number(m.likes) + Number(m.comments) + Number(m.shares),
          topPost: topPost?.title ?? null,
          followers: platFollowers,
          followerGrowth: platFollowerGrowth,
        };
      }
    );

    return NextResponse.json({
      data: {
        summary: {
          totalViews: Number(totalViews),
          totalEngagements,
          avgEngagementRate: base > 0 ? Number(
            ((totalEngagements / base) * 100).toFixed(2)
          ) : 0,
          totalImpressions: Number(totalImpressions),
          totalFollowers,
          totalFollowerGrowth,
          comparison,
        },
        platforms: platformSummaries,
        posts: postPerformance,
        trends: Array.from(trendMap.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))),
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
