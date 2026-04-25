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
    // og:title shape (most reliable when present):
    //   "Brand Name | Display Name on Instagram: \\"caption text\\""
    // og:description shape (fallback):
    //   "130 likes, 1 comments - username on April 16, 2026: \\"caption\\""
    //
    // Approach: find the "on <something>:" delimiter (works for both
    // shapes — "on Instagram:" in og:title, "on April 16, 2026:" in
    // og:description), grab everything after it, then strip one outer
    // quote pair (straight or curly). Handles captions that contain
    // internal quotes — a regex with quote delimiters would stop
    // prematurely on those.
    const stripOuterQuotes = (s) => {
      let out = (s || "").trim();
      out = out.replace(/^["\\u201C\\u2018]/, "");
      out = out.replace(/["\\u201D\\u2019]\\s*$/, "");
      return out.trim();
    };

    let caption = "";
    const titleStr = og["og:title"] || "";
    // The IG-injected "on Instagram:" appears once in og:title — grab
    // everything after it.
    const titleIdx = titleStr.lastIndexOf("on Instagram:");
    if (titleIdx >= 0) {
      caption = stripOuterQuotes(titleStr.slice(titleIdx + "on Instagram:".length));
    }

    const ogDesc = og["og:description"] || "";
    if (!caption && ogDesc) {
      // Anchor on " on <Month> <day>, <year>:" or " on Instagram:"
      const descMatch = ogDesc.match(/\\son\\s+(?:[A-Z][a-z]+\\s+\\d{1,2},\\s*\\d{4}|Instagram)[:\\s]+([\\s\\S]+)$/);
      if (descMatch) caption = stripOuterQuotes(descMatch[1]);
    }

    // ----- Likes / comments -----
    // og:description is POST-LEVEL truth. The inline-JSON findMax()
    // approach can pollute with comment-level counts (a single popular
    // comment's like count outranking the post's), so use og first and
    // only fall back to inline if og didn't yield anything.
    const likeM = ogDesc.match(/([\\d,.KMBkmb]+)\\s*likes?/i);
    const commentM = ogDesc.match(/([\\d,.KMBkmb]+)\\s*comments?/i);
    const ogLikes = likeM ? parseCount(likeM[1]) : 0;
    const ogComments = commentM ? parseCount(commentM[1]) : 0;
    const likes = ogLikes || findMax("like_count");
    const comments = ogComments || findMax("comment_count");

    // ----- Views (videos / reels only) -----
    // Primary: a logged-in single-post page renders the view count next
    // to a small <svg aria-label="View count icon"> in the player UI.
    // The number is the textContent of the surrounding wrapper div.
    // This is account-agnostic — every reel page that exposes views
    // tags its count icon with that exact aria-label / <title>.
    let svgViews = 0;
    const viewSvgs = document.querySelectorAll('svg[aria-label="View count icon"]');
    for (const svg of Array.from(viewSvgs)) {
      // Walk up two levels: svg → icon-wrapper div → row div containing
      // both the icon and the number.
      const grand = svg.parentElement && svg.parentElement.parentElement;
      if (!grand) continue;
      const text = grand.textContent || "";
      const m = text.match(/[\\d.,]+\\s*[KkMmBb]?/);
      if (!m) continue;
      const n = parseCount(m[0]);
      if (n > 0) { svgViews = n; break; }
    }

    // Fallback: inline GraphQL JSON keys. Logged-out IG (April 2026+)
    // strips play_count from this surface, but a logged-in session
    // sometimes gets it back. Cheaper than the SVG walk so still worth
    // trying as a backup.
    const inlineViews = findMax("play_count") || findMax("video_view_count") || findMax("video_play_count") || 0;

    const views = svgViews || inlineViews || 0;

    // ----- Published at -----
    // og:description's date is the actual post date (e.g. "April 16, 2026").
    // The page's <time datetime> elements are usually recent comment /
    // UI timestamps, NOT the post itself — so we only fall back to them
    // if og gave us nothing.
    let publishedAt = "";
    if (ogDesc) {
      const dateM = ogDesc.match(/on\\s+([A-Z][a-z]+\\s+\\d{1,2},\\s+\\d{4})/);
      if (dateM) {
        const parsed = new Date(dateM[1] + " 12:00:00 UTC");
        if (!isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
      }
    }
    if (!publishedAt) {
      const timeEl = document.querySelector("time[datetime]");
      publishedAt = (timeEl && timeEl.getAttribute("datetime")) || "";
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
