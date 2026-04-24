import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/sync/ig-missing-data?accountId=<handle>&limit=5000
 *
 * Returns the Instagram posts for a given account that are missing
 * title/description (scraper fallback couldn't extract them) or views
 * (video posts with no `views` metric yet). The IG backfill script on
 * Simon's Mac calls this to build its work list.
 *
 * Authenticated with CRON_SECRET_TOKEN — same token the ingest endpoint
 * accepts, so the existing scraper .env Just Works.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET_TOKEN;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const accountId = url.searchParams.get("accountId");
    const limit = Math.min(
      Number(url.searchParams.get("limit") || "5000"),
      10000
    );

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId query param is required" },
        { status: 400 }
      );
    }

    const account = await prisma.socialAccount.findFirst({
      where: { platform: "instagram", accountId },
      select: { id: true, accountId: true, accountName: true },
    });

    if (!account) {
      return NextResponse.json(
        { error: `Instagram account not found: ${accountId}` },
        { status: 404 }
      );
    }

    // Pull all posts, with a single JOIN to know whether each has any
    // `views` metric stored. We treat a post as "missing views" only for
    // video/short types — images and carousels without videos genuinely
    // don't have view counts on IG.
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        postId: string;
        postType: string;
        contentUrl: string;
        title: string | null;
        description: string | null;
        has_views: boolean;
      }>
    >(
      `SELECT p.id, p."postId", p."postType"::text AS "postType", p."contentUrl",
              p.title, p.description,
              EXISTS (
                SELECT 1 FROM "PostMetric" m
                WHERE m."postId" = p.id AND m."metricType" = 'views'
              ) AS has_views
       FROM "Post" p
       WHERE p."socialAccountId" = $1 AND p."isDeleted" = false
       ORDER BY p."publishedAt" DESC
       LIMIT $2`,
      account.id,
      limit
    );

    const needsBackfill = rows.filter((p) => {
      const missingTitle = !p.title || p.title.trim() === "";
      // Only chase views for video posts (IG doesn't expose them for
      // static images or image-only carousels).
      const missingViews = p.postType === "video" && !p.has_views;
      return missingTitle || missingViews;
    });

    return NextResponse.json({
      accountId: account.accountId,
      accountName: account.accountName,
      totalPosts: rows.length,
      needsBackfill: needsBackfill.length,
      posts: needsBackfill.map((p) => ({
        postId: p.postId,
        postType: p.postType,
        contentUrl: p.contentUrl,
        missingTitle: !p.title || p.title.trim() === "",
        missingViews: p.postType === "video" && !p.has_views,
      })),
    });
  } catch (err) {
    console.error("[ig-missing-data] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
