import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { generateExcel, type ExportRow } from "@/lib/utils/export";
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

// POST /api/exports/xlsx
export const POST = apiHandler(
  async (req, session) => {
    const body = await req.json();
    const { platform, startDate, endDate, metrics, profileId: requestedProfileId, tag, notTag } = body as {
      platform?: string;
      startDate: string;
      endDate: string;
      metrics?: string[];
      profileId?: string | string[] | null;
      tag?: string | string[] | null;
      notTag?: string | string[] | null;
    };

    if (!startDate || !endDate) {
      throw new ValidationError("startDate and endDate are required");
    }

    const orgId = session!.user.organizationId;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const profileIds = effectiveProfileIds(session!, requestedProfileId);

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

    // See csv/route.ts for the rationale on switching from include +
    // sum to DISTINCT-ON latest. Same fix, same reasons.
    const posts = await prisma.post.findMany({
      where: {
        socialAccountId: { in: accountIds },
        publishedAt: { gte: start, lte: end },
        isDeleted: false,
        ...tagFilterWhere(tag, notTag),
      },
      orderBy: { publishedAt: "desc" },
    });

    const latestMetrics = await getLatestMetrics(posts.map((p) => p.id));

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

    const buffer = generateExcel(rows, columns);
    const filename = `social-media-${platform ?? "all"}-${startDate}_to_${endDate}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  },
  { requireAuth: true }
);
