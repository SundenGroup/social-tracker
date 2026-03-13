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
    const profileId = url.searchParams.get("profileId");

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

    // Get all accounts for org (optionally filtered by profile)
    const accounts = await prisma.socialAccount.findMany({
      where: { organizationId: orgId, isActive: true, ...(profileId ? { profileId } : {}) },
      select: { id: true, platform: true, accountName: true, syncStatus: true, lastSyncedAt: true },
    });

    const accountIds = accounts.map((a) => a.id);

    // Build optional postType filter
    // "short-form" = YouTube shorts + TikTok videos + Instagram reels (video)
    // "long-form" = YouTube long-form videos only
    let postTypeFilter: Record<string, unknown> = {};
    if (contentType === "video") {
      postTypeFilter = {
        postType: { in: ["video", "short"] as import("@prisma/client").PostType[] },
      };
    } else if (contentType === "short-form") {
      postTypeFilter = {
        OR: [
          { postType: "short" as import("@prisma/client").PostType },
          { platform: "tiktok" as import("@prisma/client").Platform, postType: "video" as import("@prisma/client").PostType },
          { platform: "instagram" as import("@prisma/client").Platform, postType: "video" as import("@prisma/client").PostType },
        ],
      };
    } else if (contentType === "long-form") {
      postTypeFilter = {
        platform: "youtube" as import("@prisma/client").Platform,
        postType: "video" as import("@prisma/client").PostType,
      };
    } else if (contentType && contentType !== "all") {
      postTypeFilter = { postType: contentType as import("@prisma/client").PostType };
    }

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
        metrics: true,
      },
      orderBy: { publishedAt: "desc" },
    });

    const postDbIds = topPosts.map((p) => p.id);
    // IDs for aggregation (excludes sponsored if hideSponsored)
    const aggPostIds = hideSponsored
      ? topPosts.filter((p) => !p.isSponsored).map((p) => p.id)
      : postDbIds;

    // Build post performance list — use LATEST metric snapshot per post, not sum across dates
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

    // Build per-platform summaries from postPerformance (uses latest snapshot per post)
    const platformMap = new Map<string, { views: number; likes: number; comments: number; shares: number; impressions: number }>();
    for (const account of accounts) {
      if (!platformMap.has(account.platform)) {
        platformMap.set(account.platform, { views: 0, likes: 0, comments: 0, shares: 0, impressions: 0 });
      }
    }

    // Only aggregate non-sponsored posts for KPIs when hideSponsored is on
    const aggPosts = hideSponsored
      ? postPerformance.filter((p) => !p.isSponsored)
      : postPerformance;

    for (const p of aggPosts) {
      const plat = platformMap.get(p.platform);
      if (plat) {
        plat.views += p.views;
        plat.likes += p.likes;
        plat.comments += p.comments;
        plat.shares += p.shares;
        plat.impressions += p.impressions;
      }
    }

    // Build totals
    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalImpressions = 0;

    for (const p of platformMap.values()) {
      totalViews += p.views;
      totalLikes += p.likes;
      totalComments += p.comments;
      totalShares += p.shares;
      totalImpressions += p.impressions;
    }

    const totalEngagements = totalLikes + totalComments + totalShares;
    const base = totalViews || totalImpressions || 0;

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
      include: {
        metrics: true,
      },
    });

    let prevViews = 0;
    let prevEngagements = 0;
    let prevEngRate = 0;

    if (prevPosts.length > 0) {
      let pv = 0, pl = 0, pc = 0, ps = 0, pi = 0;
      for (const post of prevPosts) {
        const latestOf = (type: string) => {
          const records = post.metrics.filter((m) => m.metricType === type);
          if (records.length === 0) return 0;
          const latest = records.reduce((a, b) =>
            a.metricDate.getTime() > b.metricDate.getTime() ? a : b
          );
          return Number(latest.metricValue);
        };
        pv += latestOf("views");
        pl += latestOf("likes");
        pc += latestOf("comments");
        ps += latestOf("shares");
        pi += latestOf("impressions");
      }
      prevViews = pv;
      prevEngagements = pl + pc + ps;
      const prevBase = pv || pi || 0;
      prevEngRate = prevBase > 0 ? Number(((prevEngagements / prevBase) * 100).toFixed(2)) : 0;
    }

    const pctChange = (curr: number, prev: number) =>
      prev > 0 ? Number((((curr - prev) / prev) * 100).toFixed(1)) : curr > 0 ? 100 : 0;

    const comparison = {
      views: pctChange(totalViews, prevViews),
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
          views: m.views,
          engagements: m.likes + m.comments + m.shares,
          topPost: topPost?.title ?? null,
          followers: platFollowers,
          followerGrowth: platFollowerGrowth,
        };
      }
    );

    return NextResponse.json({
      data: {
        summary: {
          totalViews,
          totalEngagements,
          avgEngagementRate: base > 0 ? Number(
            ((totalEngagements / base) * 100).toFixed(2)
          ) : 0,
          totalImpressions,
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
