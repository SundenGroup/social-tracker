import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { generateCSV, type ExportRow } from "@/lib/utils/export";
import { ValidationError } from "@/lib/errors";
import { effectiveProfileIds, profileIdsWhere } from "@/lib/profile-scope";
import { tagFilterWhere } from "@/lib/tagging";
import { getLatestMetrics, metricValue } from "@/lib/metrics-helper";
import type { Platform } from "@prisma/client";

const ALL_COLUMNS = [
  "postId", "platform", "postType", "title", "contentUrl",
  "publishedAt", "views", "likes", "comments", "shares",
  "impressions", "reach", "engagementRate",
];

// POST /api/exports/csv
export const POST = apiHandler(
  async (req, session) => {
    const body = await req.json();
    const { platform, startDate, endDate, metrics, profileId: requestedProfileId, tag } = body as {
      platform?: string;
      startDate: string;
      endDate: string;
      metrics?: string[];
      profileId?: string | string[] | null;
      tag?: string | null;
    };

    if (!startDate || !endDate) {
      throw new ValidationError("startDate and endDate are required");
    }

    const orgId = session!.user.organizationId;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const profileIds = effectiveProfileIds(session!, requestedProfileId);

    // Get accounts
    const accountWhere: Record<string, unknown> = {
      organizationId: orgId,
      isActive: true,
      ...profileIdsWhere(profileIds),
    };
    if (platform) {
      accountWhere.platform = platform as Platform;
    }

    const accounts = await prisma.socialAccount.findMany({
      where: accountWhere,
      select: { id: true },
    });

    const accountIds = accounts.map((a) => a.id);

    // Get posts. Metrics are fetched separately as DISTINCT-ON per
    // (post, type) latest snapshot — the previous approach summed
    // every snapshot in the date window, which both double-counted
    // cumulative values and returned 0 for posts whose only snapshot
    // landed after the report's end date (the common case for any
    // platform synced via daily backfills).
    const posts = await prisma.post.findMany({
      where: {
        socialAccountId: { in: accountIds },
        publishedAt: { gte: start, lte: end },
        isDeleted: false,
        ...tagFilterWhere(tag),
      },
      orderBy: { publishedAt: "desc" },
    });

    const latestMetrics = await getLatestMetrics(posts.map((p) => p.id));

    // Build export rows
    const rows: ExportRow[] = posts.map((post) => {
      const views = metricValue(latestMetrics, post.id, "views");
      const likes = metricValue(latestMetrics, post.id, "likes");
      const comments = metricValue(latestMetrics, post.id, "comments");
      const shares = metricValue(latestMetrics, post.id, "shares");
      const impressions = metricValue(latestMetrics, post.id, "impressions");
      const reach = metricValue(latestMetrics, post.id, "reach");
      const engagements = likes + comments + shares;
      const base = views || impressions || 1;

      return {
        postId: post.postId,
        platform: post.platform,
        postType: post.postType,
        title: post.title ?? "",
        contentUrl: post.contentUrl,
        publishedAt: post.publishedAt.toISOString().split("T")[0],
        views,
        likes,
        comments,
        shares,
        impressions,
        reach,
        engagementRate: Number(((engagements / base) * 100).toFixed(2)),
      };
    });

    const columns = metrics?.length
      ? metrics.filter((m) => ALL_COLUMNS.includes(m))
      : ALL_COLUMNS;

    const csv = generateCSV(rows, columns);
    // Filename reflects the report's date range, not "today" — a
    // 2025 report should say so even if it's generated in 2026.
    const filename = `social-media-${platform ?? "all"}-${startDate}_to_${endDate}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  },
  { requireAuth: true }
);
