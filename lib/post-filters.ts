/**
 * Centralised builder for post-level Prisma filter fragments.
 *
 * Every dashboard / platform / comparison / export endpoint applies the
 * same set of filters: contentType, hideSponsored, and now `tag`. Doing
 * this in a single helper avoids the "miss one endpoint when adding a
 * new filter" bug — particularly important now that we have 6 endpoints
 * that need to thread the new tag filter.
 *
 * Usage:
 *   const filters = buildPostFilters({
 *     contentType: url.searchParams.get("contentType"),
 *     tag: url.searchParams.get("tag"),
 *     hideSponsored,
 *   });
 *   prisma.post.findMany({
 *     where: {
 *       socialAccountId: { in: accountIds },
 *       publishedAt: { gte: start, lte: end },
 *       isDeleted: false,
 *       ...filters,
 *     },
 *     ...
 *   });
 */

import type { Prisma } from "@prisma/client";
import { tagFilterWhere } from "@/lib/tagging";

export interface PostFilterInput {
  contentType?: string | null;
  /** Selected tags to OR-filter against. Accepts a single legacy
   *  string or an array. `tagFilterWhere` handles canonicalisation. */
  tag?: string | string[] | null;
  /** Exclusion list — posts carrying any of these are filtered out.
   *  Drives the "No extras" / default-only UX (client sends the
   *  non-primary tags in scope). */
  notTag?: string | string[] | null;
  hideSponsored?: boolean;
  /** Show ONLY sponsored posts. Overrides `hideSponsored` — selecting
   *  this is an explicit request to see sponsored posts, so the org's
   *  hide setting must not cancel it out (otherwise a mis-flagged post
   *  would be unfindable). */
  sponsoredOnly?: boolean;
}

/**
 * Build a Prisma where-fragment that the caller spreads into a wider
 * `where` clause. Composes via plain AND with anything else in the
 * outer where.
 *
 * Note: `contentType=short-form` produces an `OR` clause. Spreading
 * this fragment into another where preserves the AND semantics — the
 * inner OR groups its own conditions, and the outer keys (account,
 * date range, isDeleted) AND with the OR group as expected.
 */
export function buildPostFilters(input: PostFilterInput): Prisma.PostWhereInput {
  // Collect independent fragments and AND them together. We can't just
  // merge keys into a single object because both contentType=short-form
  // and tagFilterWhere (when "no tags" is in the selection) can each
  // produce a top-level OR clause — and Prisma doesn't merge two ORs
  // on the same object (the second wins). AND-of-ORs is the safe
  // composition.
  const fragments: Prisma.PostWhereInput[] = [];

  const ct = input.contentType ?? null;
  if (ct === "video") {
    fragments.push({ postType: { in: ["video", "short"] } });
  } else if (ct === "short-form") {
    fragments.push({
      OR: [
        { postType: "short" },
        { platform: "tiktok", postType: "video" },
        { platform: "instagram", postType: "video" },
      ],
    });
  } else if (ct === "long-form") {
    fragments.push({ platform: "youtube", postType: "video" });
  } else if (ct === "image") {
    // "image" is a top-level category that rolls up single-image posts
    // and TikTok slideshows. Instagram carousels stay in their own
    // filter ("carousel") so dashboards can break them out separately.
    fragments.push({ postType: { in: ["image", "slideshow"] } });
  } else if (ct && ct !== "all") {
    fragments.push({ postType: ct as Prisma.PostWhereInput["postType"] });
  }

  if (input.sponsoredOnly) {
    // Explicit "show sponsored" — wins over the org hide setting.
    fragments.push({ isSponsored: true });
  } else if (input.hideSponsored) {
    fragments.push({ isSponsored: false });
  }

  const tagFragment = tagFilterWhere(input.tag, input.notTag);
  if (Object.keys(tagFragment).length > 0) {
    fragments.push(tagFragment);
  }

  if (fragments.length === 0) return {};
  if (fragments.length === 1) return fragments[0];
  return { AND: fragments };
}
