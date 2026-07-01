import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { getLatestMetrics, metricValue } from "@/lib/metrics-helper";
import { effectiveProfileIds, profileIdsWhere } from "@/lib/profile-scope";
import { tagFilterWhere } from "@/lib/tagging";

export interface ContentGroupMember {
  id: string;
  platform: string;
  postType: string;
  contentUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface ContentGroup {
  groupId: string;
  title: string;
  profileId: string | null;
  profileName: string | null;
  publishedAt: string; // earliest member
  platforms: string[];
  members: ContentGroupMember[];
  totalViews: number;
  totalEngagements: number;
  engagementRate: number; // engagements / views (aggregate)
}

// GET /api/metrics/content-groups
//
// Cross-platform content pieces: posts sharing a contentGroupId are the
// same piece published on several platforms (see lib/content-grouping).
// Returns groups intersecting the date range, with per-member latest
// metrics and cross-platform aggregates, sorted by total views.
//
// Params: startDate, endDate, profileId (csv), tag (csv), notTag (csv),
//         multiOnly=1 (only groups spanning 2+ platforms), limit.
export const GET = apiHandler(
  async (req, session) => {
    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const tagParam = url.searchParams.get("tag");
    const tag = tagParam ? tagParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const notTagParam = url.searchParams.get("notTag");
    const notTag = notTagParam ? notTagParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const multiOnly = url.searchParams.get("multiOnly") === "1";
    const limit = Math.min(Number(url.searchParams.get("limit") || "200"), 500);
    const profileIds = effectiveProfileIds(session!, url.searchParams.get("profileId"));

    const orgId = session!.user.organizationId;
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 86400000);

    // Respect the org-wide hide-sponsored preference like other views.
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { hideSponsored: true },
    });
    const hideSponsored = org?.hideSponsored ?? false;

    const accounts = await prisma.socialAccount.findMany({
      where: { organizationId: orgId, isActive: true, ...profileIdsWhere(profileIds) },
      select: { id: true, profileId: true, profile: { select: { name: true } } },
    });
    const accountIds = accounts.map((a) => a.id);
    const profileByAccount = new Map(
      accounts.map((a) => [a.id, { id: a.profileId, name: a.profile?.name ?? null }])
    );

    const posts = await prisma.post.findMany({
      where: {
        socialAccountId: { in: accountIds },
        publishedAt: { gte: start, lte: end },
        isDeleted: false,
        ...(hideSponsored ? { isSponsored: false } : {}),
        ...tagFilterWhere(tag, notTag),
      },
      select: {
        id: true,
        socialAccountId: true,
        platform: true,
        postType: true,
        title: true,
        description: true,
        contentUrl: true,
        thumbnailUrl: true,
        publishedAt: true,
        contentGroupId: true,
      },
      orderBy: { publishedAt: "asc" },
    });

    const latest = await getLatestMetrics(posts.map((p) => p.id));

    // Assemble groups. Ungrouped posts (contentGroupId null — e.g.
    // unprofiled accounts) count as singleton pieces keyed by their
    // own id, so nothing disappears from the ranking.
    const groups = new Map<string, ContentGroup>();
    for (const p of posts) {
      const gid = p.contentGroupId ?? p.id;
      const views = metricValue(latest, p.id, "views");
      const likes = metricValue(latest, p.id, "likes");
      const comments = metricValue(latest, p.id, "comments");
      const shares = metricValue(latest, p.id, "shares");

      let g = groups.get(gid);
      if (!g) {
        const prof = profileByAccount.get(p.socialAccountId);
        g = {
          groupId: gid,
          title: "",
          profileId: prof?.id ?? null,
          profileName: prof?.name ?? null,
          publishedAt: p.publishedAt.toISOString(),
          platforms: [],
          members: [],
          totalViews: 0,
          totalEngagements: 0,
          engagementRate: 0,
        };
        groups.set(gid, g);
      }
      // Earliest member defines title + date (posts arrive sorted asc,
      // so the first member seen wins; prefer a member whose id IS the
      // group id — that's the canonical label post).
      if (!g.title || p.id === gid) {
        const t = (p.title || p.description || "").trim();
        if (t && (!g.title || p.id === gid)) g.title = t.slice(0, 160);
      }
      g.members.push({
        id: p.id,
        platform: p.platform,
        postType: p.postType,
        contentUrl: p.contentUrl,
        thumbnailUrl: p.thumbnailUrl,
        publishedAt: p.publishedAt.toISOString(),
        views,
        likes,
        comments,
        shares,
      });
      if (!g.platforms.includes(p.platform)) g.platforms.push(p.platform);
      g.totalViews += views;
      g.totalEngagements += likes + comments + shares;
    }

    let list = Array.from(groups.values());
    for (const g of list) {
      g.engagementRate = g.totalViews > 0
        ? Number(((g.totalEngagements / g.totalViews) * 100).toFixed(2))
        : 0;
      // Highest-viewed member first inside the group — the breakdown
      // reads as a ranking of where the piece performed best.
      g.members.sort((a, b) => b.views - a.views);
      if (!g.title) g.title = "Untitled piece";
    }
    if (multiOnly) list = list.filter((g) => g.platforms.length >= 2);
    list.sort((a, b) => b.totalViews - a.totalViews);

    const totalGroups = list.length;
    const multiGroups = list.filter((g) => g.platforms.length >= 2).length;
    list = list.slice(0, limit);

    return NextResponse.json({
      data: {
        groups: list,
        summary: {
          totalGroups,
          multiPlatformGroups: multiGroups,
          postsInRange: posts.length,
        },
      },
    });
  },
  { requireAuth: true }
);
