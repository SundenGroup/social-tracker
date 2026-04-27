import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { getLatestMetrics, metricValue } from "@/lib/metrics-helper";
import { effectiveProfileIds, profileIdsWhere } from "@/lib/profile-scope";
import { buildPostFilters } from "@/lib/post-filters";

// GET /api/metrics/dashboard - Aggregated dashboard data
export const GET = apiHandler(
  async (req, session) => {
    const t0 = Date.now();
    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const contentType = url.searchParams.get("contentType");
    const tag = url.searchParams.get("tag");
    const profileIds = effectiveProfileIds(session!, url.searchParams.get("profileId"));

    const orgId = session!.user.organizationId;

    // Default: last 30 days
    // Set end date to end-of-day so the full day is included in queries
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 86400000);

    // Check hideSponsored setting + get accounts in parallel
    const [org, accounts] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { hideSponsored: true },
      }),
      prisma.socialAccount.findMany({
        where: { organizationId: orgId, isActive: true, ...profileIdsWhere(profileIds) },
        select: { id: true, platform: true, accountName: true, syncStatus: true, lastSyncedAt: true },
      }),
    ]);
    const hideSponsored = org?.hideSponsored ?? false;

    const accountIds = accounts.map((a) => a.id);

    // Centralised filter builder — combines contentType (incl. short-/
    // long-form composites), tag, and hideSponsored into a single
    // spread-fragment. Replaces the previous separate postTypeFilter +
    // sponsoredFilter pair so adding new filters (the tag filter is
    // the latest) requires touching only lib/post-filters.ts.
    const postFilters = buildPostFilters({ contentType, tag, hideSponsored });

    // Previous period dates (needed for parallel query)
    const rangeDuration = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - rangeDuration);

    const t1 = Date.now();

    // Run current posts, previous posts, and rollup queries in parallel
    const [topPosts, prevPosts, latestRollups, earliestRollups] = await Promise.all([
      prisma.post.findMany({
        where: {
          socialAccountId: { in: accountIds },
          publishedAt: { gte: start, lte: end },
          isDeleted: false,
          ...postFilters,
        },
        orderBy: { publishedAt: "desc" },
        take: 5000,
      }),
      prisma.post.findMany({
        where: {
          socialAccountId: { in: accountIds },
          publishedAt: { gte: prevStart, lte: prevEnd },
          isDeleted: false,
          ...postFilters,
        },
        select: { id: true },
      }),
      prisma.accountDailyRollup.findMany({
        where: { socialAccountId: { in: accountIds } },
        orderBy: { rollupDate: "desc" },
        distinct: ["socialAccountId"],
        select: { totalFollowers: true, socialAccountId: true },
      }),
      prisma.accountDailyRollup.findMany({
        where: {
          socialAccountId: { in: accountIds },
          rollupDate: { gte: start, lte: end },
        },
        orderBy: { rollupDate: "asc" },
        distinct: ["socialAccountId"],
        select: { totalFollowers: true, socialAccountId: true },
      }),
    ]);

    const t2 = Date.now();

    // Fetch metrics for current and previous periods in parallel
    const postDbIds = topPosts.map((p) => p.id);
    const [metricsMap, prevMetrics] = await Promise.all([
      getLatestMetrics(postDbIds),
      prevPosts.length > 0 ? getLatestMetrics(prevPosts.map((p) => p.id)) : Promise.resolve(new Map()),
    ]);

    const t3 = Date.now();
    console.log(`[Dashboard] ${topPosts.length} posts, ${prevPosts.length} prev | queries: ${t2 - t1}ms, metrics: ${t3 - t2}ms, total: ${t3 - t0}ms`);

    // Build post performance list
    const postPerformance = topPosts.map((post) => {
      const views = metricValue(metricsMap, post.id, "views");
      const likes = metricValue(metricsMap, post.id, "likes");
      const comments = metricValue(metricsMap, post.id, "comments");
      const shares = metricValue(metricsMap, post.id, "shares");
      const impressions = metricValue(metricsMap, post.id, "impressions");
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
        tags: post.tags ?? [],
        manualTags: post.manualTags ?? [],
        views,
        likes,
        comments,
        shares,
        impressions,
        engagementRate: base > 0 ? Number(((engagements / base) * 100).toFixed(2)) : 0,
      };
    });

    // Build trend data: aggregate views by publish date, grouped by platform.
    // Exclude sponsored posts from trends when hideSponsored is on.
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

    // Fill every day in [start, end] so the X-axis spans the full range,
    // even when no posts were published. Empty days get a `{date}`-only
    // row; the chart treats missing platform values as gaps (line breaks)
    // rather than fake drops-to-zero.
    const fillStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const fillEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    for (const d = new Date(fillStart); d <= fillEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().split("T")[0];
      if (!trendMap.has(key)) {
        trendMap.set(key, { date: key } as unknown as Record<string, number>);
      }
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

    // Previous period comparison (data already fetched in parallel above)
    let prevViews = 0;
    let prevEngagements = 0;
    let prevEngRate = 0;

    if (prevPosts.length > 0) {
      let pv = 0, pl = 0, pc = 0, ps = 0, pi = 0;
      for (const post of prevPosts) {
        pv += metricValue(prevMetrics, post.id, "views");
        pl += metricValue(prevMetrics, post.id, "likes");
        pc += metricValue(prevMetrics, post.id, "comments");
        ps += metricValue(prevMetrics, post.id, "shares");
        pi += metricValue(prevMetrics, post.id, "impressions");
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
      posts: pctChange(aggPosts.length, prevPosts.length),
    };

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
          totalPosts: aggPosts.length,
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
