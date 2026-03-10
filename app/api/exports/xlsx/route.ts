import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { generateExcel, type ExportRow } from "@/lib/utils/export";
import { ValidationError } from "@/lib/errors";
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
    const { platform, startDate, endDate, metrics } = body as {
      platform?: string;
      startDate: string;
      endDate: string;
      metrics?: string[];
    };

    if (!startDate || !endDate) {
      throw new ValidationError("startDate and endDate are required");
    }

    const orgId = session!.user.organizationId;
    const start = new Date(startDate);
    const end = new Date(endDate);

    const accountWhere: Record<string, unknown> = {
      organizationId: orgId,
      isActive: true,
    };
    if (platform) {
      accountWhere.platform = platform as Platform;
    }

    const accounts = await prisma.socialAccount.findMany({
      where: accountWhere,
      select: { id: true },
    });

    const accountIds = accounts.map((a) => a.id);

    const posts = await prisma.post.findMany({
      where: {
        socialAccountId: { in: accountIds },
        publishedAt: { gte: start, lte: end },
        isDeleted: false,
      },
      include: {
        metrics: {
          where: { metricDate: { gte: start, lte: end } },
        },
      },
      orderBy: { publishedAt: "desc" },
    });

    const rows: ExportRow[] = posts.map((post) => {
      const pm = post.metrics;
      const sumOf = (type: string) =>
        pm.filter((m) => m.metricType === type).reduce((s, m) => s + Number(m.metricValue), 0);

      const views = sumOf("views");
      const likes = sumOf("likes");
      const comments = sumOf("comments");
      const shares = sumOf("shares");
      const impressions = sumOf("impressions");
      const reach = sumOf("reach");
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
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `social-media-${platform ?? "all"}-${dateStr}.xlsx`;

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
