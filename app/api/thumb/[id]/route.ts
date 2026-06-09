import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readCached, fetchAndCache, placeholderSvg } from "@/lib/thumbnails";

// Public image route — no auth so <img> tags load and responses cache
// aggressively. Thumbnails are public social-media images keyed only by
// our internal post id.
export const dynamic = "force-dynamic";

function svgResponse(svg: string, maxAge: number) {
  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
    },
  });
}

function jpegResponse(buf: Buffer, immutable: boolean) {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": immutable
        ? "public, max-age=31536000, immutable"
        : "public, max-age=86400",
    },
  });
}

/**
 * GET /api/thumb/[id] — caching thumbnail proxy.
 *
 *   1. Serve a permanently-cached copy from disk if present.
 *   2. Otherwise resolve a source URL (stored, or YouTube-derived).
 *   3. TikTok / YouTube / Twitter: the droplet can fetch — download,
 *      resize, persist, serve. Survives the source URL's expiry.
 *   4. Instagram: droplet is 403'd by the CDN, and we only reach this
 *      route when the browser's direct fetch already failed, so serve a
 *      branded placeholder (a permanent copy may have been uploaded by
 *      the Mac backfill, which step 1 would have served).
 *   5. Anything unresolved: branded placeholder — never a blank box.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).pathname.split("/").pop() || "";

  // 1. Disk cache → permanent.
  const cached = await readCached(id);
  if (cached) return jpegResponse(cached, true);

  // 2. Resolve the post + a source URL.
  const post = await prisma.post.findUnique({
    where: { id },
    select: { platform: true, postId: true, thumbnailUrl: true },
  });
  if (!post) return svgResponse(placeholderSvg("unknown"), 3600);

  let source = post.thumbnailUrl || null;
  if (!source && post.platform === "youtube" && post.postId) {
    source = `https://i.ytimg.com/vi/${post.postId}/hqdefault.jpg`;
  }
  if (!source) return svgResponse(placeholderSvg(post.platform), 3600);

  // 4. Instagram — can't fetch from the datacenter IP.
  if (post.platform === "instagram") {
    return svgResponse(placeholderSvg(post.platform), 3600);
  }

  // 3. Fetch + cache (TikTok, YouTube-derived, Twitter, VK).
  const fetched = await fetchAndCache(id, source);
  if (fetched) return jpegResponse(fetched, true);

  // 5. Source dead/expired, nothing cached → placeholder.
  return svgResponse(placeholderSvg(post.platform), 3600);
}
