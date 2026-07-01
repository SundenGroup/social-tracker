import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { getLatestMetrics, metricValue } from "@/lib/metrics-helper";
import { effectiveProfileIds, profileIdsWhere } from "@/lib/profile-scope";
import { tagFilterWhere } from "@/lib/tagging";
import type { Platform, PostType } from "@prisma/client";

const ALL_PLATFORMS: Platform[] = ["youtube", "twitter", "instagram", "tiktok", "vk"];

interface PeriodPlatformRow {
  platform: string;
  views: number;
  engagements: number;
  engagementRate: number;
  posts: number;
}

interface TopPostLite {
  id: string;
  platform: string;
  title: string | null;
  contentUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  views: number;
  engagements: number;
}

interface ContentTypeRow {
  type: string;
  views: number;
  engagements: number;
  posts: number;
}

interface PeriodSummary {
  label: string;
  summary: {
    totalViews: number;
    totalEngagements: number;
    avgEngagementRate: number;
    totalPosts: number;
    /** totalViews / totalPosts — separates "posted more" from "posted better". */
    viewsPerPost: number;
    /** Sum of AccountDailyRollup.newFollowers inside the period. NULL when
     *  the period has zero rollup coverage (follower tracking started after
     *  the period ended) — the UI renders an explainer instead of a bogus 0. */
    followersGained: number | null;
  };
  /** Follower-tracking coverage for THIS period. Tracking only exists from
   *  the first daily rollup ever recorded; periods before that can't be
   *  compared on followers. */
  followerCoverage: { status: "full" | "partial" | "none"; trackingSince: string | null };
  platforms: PeriodPlatformRow[];
  dailyTrend: { day: number; views: number; engagements: number }[];
  topPosts: TopPostLite[];
  contentTypes: ContentTypeRow[];
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
    // "image" rolls up single-image posts and TikTok slideshows into
    // one "non-video" bucket. Carousels stay separate.
    return { postType: { in: ["image", "slideshow"] as PostType[] } };
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

  // Iterate ALL_PLATFORMS for stable display order, but skip platforms
  // the in-scope profiles don't operate on — otherwise a 0-row leaks
  // through (e.g. VK shows up empty for non-CIS profiles).
  for (const platform of ALL_PLATFORMS) {
    const platAccountIds = accountsByPlatform.get(platform) ?? [];
    if (platAccountIds.length === 0) continue;

    const postWhere: Record<string, unknown> = {
      socialAccountId: { in: platAccountIds },
      publishedAt: { gte: start, lte: end },
      isDeleted: false,
      ...postTypeFilter,
    };
    if (hideSponsored) postWhere.isSponsored = false;

    const posts = await prisma.post.findMany({
      where: postWhere,
      select: { id: true },
    });

    const metricsMap = await getLatestMetrics(posts.map((p) => p.id));

    let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;

    for (const post of posts) {
      totalViews += metricValue(metricsMap, post.id, "views");
      totalLikes += metricValue(metricsMap, post.id, "likes");
      totalComments += metricValue(metricsMap, post.id, "comments");
      totalShares += metricValue(metricsMap, post.id, "shares");
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

  // One full-period post pass powers the daily trend, top posts, and
  // the content-type breakdown (metrics reused across all three).
  const allPostWhere: Record<string, unknown> = {
    socialAccountId: { in: accountIds },
    publishedAt: { gte: start, lte: end },
    isDeleted: false,
    ...postTypeFilter,
  };
  if (hideSponsored) allPostWhere.isSponsored = false;

  const periodPosts = await prisma.post.findMany({
    where: allPostWhere,
    select: {
      id: true,
      publishedAt: true,
      platform: true,
      postType: true,
      title: true,
      description: true,
      contentUrl: true,
      thumbnailUrl: true,
    },
  });

  const periodMetrics = await getLatestMetrics(periodPosts.map((p) => p.id));

  const startTime = start.getTime();
  const dayViews = new Map<number, number>();
  const dayEng = new Map<number, number>();
  const typeMap = new Map<string, ContentTypeRow>();
  const enriched: Array<{ post: (typeof periodPosts)[number]; views: number; engagements: number }> = [];

  for (const post of periodPosts) {
    const views = metricValue(periodMetrics, post.id, "views");
    const engagements =
      metricValue(periodMetrics, post.id, "likes") +
      metricValue(periodMetrics, post.id, "comments") +
      metricValue(periodMetrics, post.id, "shares");
    enriched.push({ post, views, engagements });

    const dayOffset = Math.floor((post.publishedAt.getTime() - startTime) / 86400000);
    if (views > 0) dayViews.set(dayOffset, (dayViews.get(dayOffset) ?? 0) + views);
    if (engagements > 0) dayEng.set(dayOffset, (dayEng.get(dayOffset) ?? 0) + engagements);

    const t = typeMap.get(post.postType) ?? { type: post.postType, views: 0, engagements: 0, posts: 0 };
    t.views += views;
    t.engagements += engagements;
    t.posts += 1;
    typeMap.set(post.postType, t);
  }

  const totalDays = Math.ceil((end.getTime() - startTime) / 86400000) + 1;
  const dailyTrend: { day: number; views: number; engagements: number }[] = [];
  for (let d = 0; d < totalDays; d++) {
    dailyTrend.push({ day: d + 1, views: dayViews.get(d) ?? 0, engagements: dayEng.get(d) ?? 0 });
  }

  const topPosts: TopPostLite[] = enriched
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)
    .map(({ post, views, engagements }) => ({
      id: post.id,
      platform: post.platform,
      title: (post.title || post.description || "").slice(0, 140) || null,
      contentUrl: post.contentUrl,
      thumbnailUrl: post.thumbnailUrl,
      publishedAt: post.publishedAt.toISOString(),
      views,
      engagements,
    }));

  const contentTypes = Array.from(typeMap.values()).sort((a, b) => b.views - a.views);

  // Followers gained + coverage. Tracking exists only from the first
  // rollup ever recorded — a period entirely before that has NO
  // follower data and must not render as "0 (-100%)".
  //
  // Coverage is judged by ROW COUNT vs expectation, not just the first
  // rollup date: rollups are one row per account per day
  // (@@unique([socialAccountId, rollupDate])), written only when that
  // account actually syncs. Checking only "tracking started before the
  // period" misses (a) accounts whose tracking began later than
  // others', (b) mid-period sync outages, and (c) periods ending
  // today/future where tail days can't have rows yet — each of which
  // silently deflates one side and fabricates a swing. We expect
  // accounts × days-through-yesterday rows and grant "full" at ≥95%
  // (a couple of globally missed days shouldn't nuke a year-over-year
  // comparison, but a whole absent account/platform must).
  const [rollupAgg, firstRollup] = await Promise.all([
    prisma.accountDailyRollup.aggregate({
      where: { socialAccountId: { in: accountIds }, rollupDate: { gte: start, lte: end } },
      _sum: { newFollowers: true },
      _count: { _all: true },
    }),
    prisma.accountDailyRollup.findFirst({
      where: { socialAccountId: { in: accountIds } },
      orderBy: { rollupDate: "asc" },
      select: { rollupDate: true },
    }),
  ]);
  const trackingSince = firstRollup?.rollupDate ?? null;

  // Expected coverage window: period days up to and including
  // YESTERDAY (UTC) — today's rollup only exists after that account's
  // daily sync has run, and future days can never have rows.
  const startOfTodayUtc = new Date();
  startOfTodayUtc.setUTCHours(0, 0, 0, 0);
  const effectiveEndMs = Math.min(end.getTime(), startOfTodayUtc.getTime() - 1);
  const expectedDays =
    effectiveEndMs >= startTime
      ? Math.floor((effectiveEndMs - startTime) / 86400000) + 1
      : 0;
  const expectedRows = expectedDays * accountIds.length;
  const actualRows = rollupAgg._count._all;

  let coverageStatus: "full" | "partial" | "none";
  if (actualRows === 0 || expectedRows === 0) {
    coverageStatus = "none";
  } else if (actualRows >= expectedRows * 0.95) {
    coverageStatus = "full";
  } else {
    coverageStatus = "partial";
  }
  const followersGained =
    coverageStatus === "none" ? null : Number(rollupAgg._sum.newFollowers ?? 0);

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
  const viewsPerPost = totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0;

  return {
    label: formatLabel(start, end),
    summary: { totalViews, totalEngagements, avgEngagementRate, totalPosts, viewsPerPost, followersGained },
    followerCoverage: {
      status: coverageStatus,
      trackingSince: trackingSince ? trackingSince.toISOString() : null,
    },
    platforms: platformRows,
    dailyTrend,
    topPosts,
    contentTypes,
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
    const profileIds = effectiveProfileIds(session!, url.searchParams.get("profileId"));
    const contentType = url.searchParams.get("contentType");
    const tagParam = url.searchParams.get("tag");
    const tag = tagParam ? tagParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const notTagParam = url.searchParams.get("notTag");
    const notTag = notTagParam ? notTagParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const startDateA = url.searchParams.get("startDateA");
    const endDateA = url.searchParams.get("endDateA");
    const startDateB = url.searchParams.get("startDateB");
    const endDateB = url.searchParams.get("endDateB");

    const now = new Date();
    const endA = endDateA ? new Date(endDateA) : now;
    endA.setHours(23, 59, 59, 999);
    const startA = startDateA ? new Date(startDateA) : new Date(endA.getTime() - 30 * 86400000);
    const endB = endDateB ? new Date(endDateB) : new Date(endA.getTime() - 365 * 86400000);
    endB.setHours(23, 59, 59, 999);
    const startB = startDateB ? new Date(startDateB) : new Date(startA.getTime() - 365 * 86400000);

    // Check hideSponsored setting
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { hideSponsored: true },
    });
    const hideSponsored = org?.hideSponsored ?? false;

    // Get account IDs
    const accounts = await prisma.socialAccount.findMany({
      where: { organizationId: orgId, isActive: true, ...profileIdsWhere(profileIds) },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);
    // Merge content-type + tag into the single `extraFilter` aggregatePeriod
    // already accepts. The function spreads it at the top-level of where{}
    // alongside socialAccountId / publishedAt / isDeleted, so an OR-shaped
    // contentType (short-form) ANDs with the tag filter as expected.
    const extraFilter = { ...buildPostTypeFilter(contentType), ...tagFilterWhere(tag, notTag) };

    // Aggregate both periods in parallel
    const [periodA, periodB] = await Promise.all([
      aggregatePeriod(accountIds, startA, endA, hideSponsored, extraFilter),
      aggregatePeriod(accountIds, startB, endB, hideSponsored, extraFilter),
    ]);

    // Compute changes
    const changes = {
      views: pctChange(periodA.summary.totalViews, periodB.summary.totalViews),
      engagements: pctChange(periodA.summary.totalEngagements, periodB.summary.totalEngagements),
      engagementRate: Number(
        (periodA.summary.avgEngagementRate - periodB.summary.avgEngagementRate).toFixed(2)
      ),
      posts: pctChange(periodA.summary.totalPosts, periodB.summary.totalPosts),
      viewsPerPost: pctChange(periodA.summary.viewsPerPost, periodB.summary.viewsPerPost),
      // Followers delta is only meaningful when BOTH periods have full
      // rollup coverage — partial/none on either side yields null and
      // the UI explains why instead of showing a fake swing.
      followers:
        periodA.followerCoverage.status === "full" &&
        periodB.followerCoverage.status === "full" &&
        periodA.summary.followersGained != null &&
        periodB.summary.followersGained != null
          ? pctChange(periodA.summary.followersGained, periodB.summary.followersGained)
          : null,
      // Match the per-period filter — only platforms with in-scope
      // accounts are present in periodA.platforms; periodB uses the
      // same accountIds so its platform set is identical.
      platforms: periodA.platforms.map((a) => {
        const b = periodB.platforms.find((p) => p.platform === a.platform);
        return {
          platform: a.platform,
          views: pctChange(a.views, b?.views ?? 0),
          engagements: pctChange(a.engagements, b?.engagements ?? 0),
          engagementRate: Number((a.engagementRate - (b?.engagementRate ?? 0)).toFixed(2)),
          posts: pctChange(a.posts, b?.posts ?? 0),
        };
      }),
    };

    return NextResponse.json({ data: { periodA, periodB, changes } });
  },
  { requireAuth: true }
);
