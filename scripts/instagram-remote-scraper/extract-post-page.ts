/**
 * Shared browser-side script that pulls a post's data from a single
 * Instagram post page (run via `page.evaluate(EXTRACT_POST_PAGE_JS)`).
 *
 * Used by both:
 *   - scrape.ts's fallback (when the private /api/v1/media/.../info/
 *     endpoint is rate-limited)
 *   - backfill-details.ts (whole-account historical fill-in)
 *
 * Extraction strategy, in priority order:
 *
 *   Caption / title / description:
 *     1. og:title — format: "{name} on Instagram: \"{caption}\""
 *     2. og:description — format: "{N} likes, {M} comments - {user}
 *                                   on {month day, year}: \"{caption}\""
 *
 *   Views (videos / reels only):
 *     - Scan the inline HTML for IG's GraphQL JSON keys:
 *         "play_count":N , "video_view_count":N , "video_play_count":N
 *       Take the maximum across all matches (the post's count is the
 *       largest such number on the page).
 *
 *   Likes / comments:
 *     1. Inline JSON ("like_count":N / "comment_count":N) — most accurate
 *     2. og:description regex ("130 likes, 1 comments")
 *
 *   PublishedAt:
 *     1. <time datetime> attribute (when present)
 *     2. og:description "on {month day, year}" parsed
 *
 *   Post type:
 *     - og:url containing "/reel/" or "/tv/" → video
 *     - else: detected views > 0 → video, otherwise inherit caller's hint
 *
 * NOTE on JSON-LD: Instagram dropped Schema.org JSON-LD from logged-out
 * post pages around April 2026. Earlier versions of this code parsed
 * <script type="application/ld+json"> as the primary source — it now
 * returns 0 blocks on real-world post pages, so og: tags + inline-JSON
 * scan are the only reliable surfaces left.
 */
export const EXTRACT_POST_PAGE_JS = `
  (() => {
    // Full HTML — used for inline-JSON regex scans (play_count, etc.)
    const html = document.documentElement.outerHTML;

    // findMax: the largest value for a given JSON key across the whole
    // serialized HTML. Useful for posts that embed the same payload
    // multiple times (page-level + comment-level), where the post-level
    // count is reliably the largest.
    const findMax = (key) => {
      const re = new RegExp('"' + key + '"\\\\s*:\\\\s*(\\\\d+)', 'g');
      let max = 0;
      let m;
      while ((m = re.exec(html)) !== null) {
        const n = Number(m[1]);
        if (n > max) max = n;
      }
      return max;
    };

    // Parse a textual count like "1.2K" / "1,234" / "5 thousand"
    const parseCount = (s) => {
      if (!s) return 0;
      const cleaned = String(s).replace(/[,\\s]/g, "");
      const m = cleaned.match(/([\\d.]+)([KMBkmb])?/);
      if (!m) return 0;
      const num = parseFloat(m[1]);
      const suf = (m[2] || "").toUpperCase();
      if (suf === "K") return Math.round(num * 1000);
      if (suf === "M") return Math.round(num * 1000000);
      if (suf === "B") return Math.round(num * 1000000000);
      return Math.round(num);
    };

    // Collect all og: meta tags into a dict
    const og = {};
    for (const m of Array.from(document.querySelectorAll('meta[property^="og:"]'))) {
      const k = m.getAttribute("property");
      if (k) og[k] = m.getAttribute("content") || "";
    }

    // ----- Caption -----
    // og:title shape (most reliable):
    //   "Brand Name | Display Name on Instagram: \\"caption text\\""
    // Match "on Instagram:" literally, then a quote of any flavour
    // (straight, curly), then capture greedily-but-non-greedily until
    // the closing quote at end of string.
    let caption = "";
    const titleStr = og["og:title"] || "";
    const titleMatch = titleStr.match(/on Instagram[:\\s]+["\\u201C\\u2018]([\\s\\S]*?)["\\u201D\\u2019]\\s*$/);
    if (titleMatch) caption = titleMatch[1];

    // og:description shape (fallback):
    //   "130 likes, 1 comments - username on April 16, 2026: \\"caption\\""
    // The literal " on " is preceded by username and followed by a
    // date or "Instagram", then the colon + quoted caption.
    const ogDesc = og["og:description"] || "";
    if (!caption) {
      const descMatch = ogDesc.match(/on\\s+[A-Za-z][\\w\\s,]+:\\s*["\\u201C\\u2018]([\\s\\S]*?)["\\u201D\\u2019]\\s*$/);
      if (descMatch) caption = descMatch[1];
    }

    // ----- Likes / comments -----
    const inlineLikes = findMax("like_count");
    const inlineComments = findMax("comment_count");
    const likeM = ogDesc.match(/([\\d,.KMBkmb]+)\\s*likes?/i);
    const commentM = ogDesc.match(/([\\d,.KMBkmb]+)\\s*comments?/i);
    const ogLikes = likeM ? parseCount(likeM[1]) : 0;
    const ogComments = commentM ? parseCount(commentM[1]) : 0;
    const likes = inlineLikes || ogLikes;
    const comments = inlineComments || ogComments;

    // ----- Views (videos / reels only) -----
    const views = findMax("play_count") || findMax("video_view_count") || findMax("video_play_count") || 0;

    // ----- Published at -----
    const timeEl = document.querySelector("time[datetime]");
    let publishedAt = (timeEl && timeEl.getAttribute("datetime")) || "";
    if (!publishedAt && ogDesc) {
      // og:description has the date as e.g. "on April 16, 2026"
      const dateM = ogDesc.match(/on\\s+([A-Z][a-z]+\\s+\\d{1,2},\\s+\\d{4})/);
      if (dateM) {
        const parsed = new Date(dateM[1] + " 12:00:00 UTC");
        if (!isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
      }
    }

    // ----- Post type -----
    const ogUrl = og["og:url"] || "";
    const isVideo = /\\/reel\\//.test(ogUrl) || /\\/tv\\//.test(ogUrl) || views > 0;

    return {
      caption,
      isVideo,
      views,
      likes,
      comments,
      publishedAt,
      thumbnailUrl: og["og:image"] || null,
    };
  })()
`;

export interface PostPageExtraction {
  caption: string;
  isVideo: boolean;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string;
  thumbnailUrl: string | null;
}
