import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readCached } from "@/lib/thumbnails";

// GET /api/thumb/pending?platform=instagram&limit=400
//
// Lists posts that still need a permanently-cached thumbnail: they have
// a stored source URL but no file on disk yet. The Mac backfill drains
// this (download from a residential IP → POST /api/thumb/upload),
// which creates the cache files, so repeated calls converge to empty.
//
// Auth: same bearer token as ingest / upload.
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET_TOKEN || token !== process.env.CRON_SECRET_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const platform = url.searchParams.get("platform") || "instagram";
  const limit = Math.min(Number(url.searchParams.get("limit") || "400"), 1000);

  // Pull a generous candidate window (newest first — those URLs are
  // most likely still valid), then filter to the uncached ones.
  const candidates = await prisma.post.findMany({
    where: {
      platform: platform as never,
      isDeleted: false,
      thumbnailUrl: { not: null },
    },
    select: { id: true, thumbnailUrl: true },
    orderBy: { publishedAt: "desc" },
    take: limit * 4,
  });

  const pending: Array<{ id: string; thumbnailUrl: string }> = [];
  for (const c of candidates) {
    if (pending.length >= limit) break;
    if (!c.thumbnailUrl) continue;
    const cached = await readCached(c.id);
    if (!cached) pending.push({ id: c.id, thumbnailUrl: c.thumbnailUrl });
  }

  return NextResponse.json({ platform, count: pending.length, pending });
}
