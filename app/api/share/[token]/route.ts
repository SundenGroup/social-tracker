import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getLatestMetrics, metricValue } from "@/lib/metrics-helper";

/**
 * GET /api/share/:token — PUBLIC (the 32-hex token is the credential).
 * Computes the shared report live: KPIs, per-platform rows, top posts.
 * Only ever exposes the scope pinned into the SharedReport row.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).pathname.split("/").pop() ?? "";
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const report = await prisma.sharedReport.findUnique({ where: { token } });
  if (!report || report.revokedAt) {
    return NextResponse.json({ error: "This report link is no longer available" }, { status: 404 });
  }

  const [org, profile, accounts] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: report.organizationId },
      select: { name: true, hideSponsored: true },
    }),
    report.profileId
      ? prisma.profile.findUnique({ where: { id: report.profileId }, select: { name: true } })
      : Promise.resolve(null),
    prisma.socialAccount.findMany({
      where: {
        organizationId: report.organizationId,
        isActive: true,
        ...(report.profileId ? { profileId: report.profileId } : {}),
      },
      select: { id: true },
    }),
  ]);

  const accountIds = accounts.map((a) => a.id);
  const where: Record<string, unknown> = {
    socialAccountId: { in: accountIds },
    publishedAt: { gte: report.startDate, lte: report.endDate },
    isDeleted: false,
  };
  if (org?.hideSponsored) where.isSponsored = false;

  const posts = await prisma.post.findMany({
    where,
    select: {
      id: true,
      platform: true,
      title: true,
      description: true,
      contentUrl: true,
      thumbnailUrl: true,
      publishedAt: true,
    },
    orderBy: { publishedAt: "desc" },
    take: 5000,
  });
  const metrics = await getLatestMetrics(posts.map((p) => p.id));

  const platformAgg = new Map<string, { posts: number; views: number; engagements: number }>();
  const enriched = posts.map((p) => {
    const views = metricValue(metrics, p.id, "views");
    const engagements =
      metricValue(metrics, p.id, "likes") + metricValue(metrics, p.id, "comments") + metricValue(metrics, p.id, "shares");
    const agg = platformAgg.get(p.platform) ?? { posts: 0, views: 0, engagements: 0 };
    agg.posts += 1;
    agg.views += views;
    agg.engagements += engagements;
    platformAgg.set(p.platform, agg);
    return { p, views, engagements };
  });

  const totalViews = enriched.reduce((s, e) => s + e.views, 0);
  const totalEng = enriched.reduce((s, e) => s + e.engagements, 0);

  const topPosts = enriched
    .sort((a, b) => b.views - a.views)
    .slice(0, 12)
    .map(({ p, views, engagements }) => ({
      id: p.id,
      platform: p.platform,
      title: (p.title || p.description || "Untitled").replace(/\s+/g, " ").slice(0, 90),
      contentUrl: p.contentUrl,
      thumbnailUrl: p.thumbnailUrl,
      publishedAt: p.publishedAt.toISOString(),
      views,
      engagements,
    }));

  return NextResponse.json({
    data: {
      title: report.title,
      organization: org?.name ?? "",
      scope: profile?.name ?? "All profiles",
      startDate: report.startDate.toISOString().slice(0, 10),
      endDate: report.endDate.toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      summary: {
        posts: posts.length,
        views: totalViews,
        engagements: totalEng,
        engagementRate: totalViews > 0 ? Number(((totalEng / totalViews) * 100).toFixed(2)) : 0,
      },
      platforms: Array.from(platformAgg.entries())
        .sort((a, b) => b[1].views - a[1].views)
        .map(([platform, agg]) => ({ platform, ...agg })),
      topPosts,
    },
  });
}
