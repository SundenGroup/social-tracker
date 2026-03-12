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

    // Check hideSponsored setting
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { hideSponsored: true },
    });
    const hideSponsored = org?.hideSponsored ?? false;

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
        isSponsored: post.isSponsored,
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

    // Summary: aggregate from postPerformance using latest snapshot per post
    // Filter out sponsored posts from aggregation when hideSponsored is on
    const aggPosts = hideSponsored
      ? postPerformance.filter((p) => !p.isSponsored)
      : postPerformance;

    let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;
    let totalImpressions = 0, totalReach = 0;

    for (const p of aggPosts) {
      totalViews += p.views;
      totalLikes += p.likes;
      totalComments += p.comments;
      totalShares += p.shares;
      totalImpressions += p.impressions;
      totalReach += p.reach;
    }

    const totalEngagements = totalLikes + totalComments + totalShares;
    const engBase = totalViews || totalImpressions || 0;

    // Previous period comparison
    const rangeDuration = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - rangeDuration);

    const prevPostWhere: Record<string, unknown> = {
      socialAccountId: { in: accountIds },
      publishedAt: { gte: prevStart, lte: prevEnd },
      isDeleted: false,
    };
    if (contentType && contentType !== "all") {
      prevPostWhere.postType = contentType;
    }
    if (hideSponsored) {
      prevPostWhere.isSponsored = false;
    }

    const prevPosts = await prisma.post.findMany({
      where: prevPostWhere,
      include: { metrics: true },
    });

    let prevViews = 0, prevLikes = 0, prevComments = 0, prevShares = 0, prevImpressions = 0;

    for (const post of prevPosts) {
      const latestOf = (type: string) => {
        const records = post.metrics.filter((m) => m.metricType === type);
        if (records.length === 0) return 0;
        const latest = records.reduce((a, b) =>
          a.metricDate.getTime() > b.metricDate.getTime() ? a : b
        );
        return Number(latest.metricValue);
      };
      prevViews += latestOf("views");
      prevLikes += latestOf("likes");
      prevComments += latestOf("comments");
      prevShares += latestOf("shares");
      prevImpressions += latestOf("impressions");
    }

    const prevEngagements = prevLikes + prevComments + prevShares;
    const prevEngBase = prevViews || prevImpressions || 0;
    const pctChange = (curr: number, prev: number) =>
      prev > 0 ? Number((((curr - prev) / prev) * 100).toFixed(1)) : curr > 0 ? 100 : 0;

    const comparison = {
      views: pctChange(totalViews, prevViews),
      likes: pctChange(totalLikes, prevLikes),
      comments: pctChange(totalComments, prevComments),
      engagements: pctChange(totalEngagements, prevEngagements),
      engagementRate: pctChange(
        engBase > 0 ? Number(((totalEngagements / engBase) * 100).toFixed(2)) : 0,
        prevEngBase > 0 ? Number(((prevEngagements / prevEngBase) * 100).toFixed(2)) : 0,
      ),
      posts: pctChange(posts.length, prevPosts.length),
    };

    // Build trend data: aggregate metrics by publish date
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
      entry.views = (entry.views || 0) + post.views;
      entry.likes = (entry.likes || 0) + post.likes;
      entry.comments = (entry.comments || 0) + post.comments;
      entry.shares = (entry.shares || 0) + post.shares;
      entry.impressions = (entry.impressions || 0) + post.impressions;
      entry.reach = (entry.reach || 0) + post.reach;
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
          totalPosts: aggPosts.length,
          comparison,
        },
        accountStats: {
          totalFollowers,
          followerGrowth,
        },
        posts: postPerformance,
        trends: Array.from(trendMap.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))),
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
