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
  tag?: string | null;
  hideSponsored?: boolean;
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
  const out: Prisma.PostWhereInput = {};

  // Content type
  const ct = input.contentType ?? null;
  if (ct === "video") {
    out.postType = { in: ["video", "short"] };
  } else if (ct === "short-form") {
    out.OR = [
      { postType: "short" },
      { platform: "tiktok", postType: "video" },
      { platform: "instagram", postType: "video" },
    ];
  } else if (ct === "long-form") {
    out.platform = "youtube";
    out.postType = "video";
  } else if (ct && ct !== "all") {
    out.postType = ct as Prisma.PostWhereInput["postType"];
  }

  // Sponsored
  if (input.hideSponsored) {
    out.isSponsored = false;
  }

  // Tag
  const tagFragment = tagFilterWhere(input.tag);
  if (tagFragment.tags) {
    out.tags = tagFragment.tags;
  }

  return out;
}
