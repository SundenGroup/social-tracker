import type { PostType } from "@prisma/client";

/**
 * The house content-format buckets. These are VIRTUAL groupings over
 * the PostType enum — "short-form" is not a postType, it's a
 * cross-platform concept: YouTube Shorts + TikTok videos + Instagram
 * reels. Single source of truth shared by the Compare-periods API and
 * the Ask tools so the two can never disagree on what "short-form"
 * means.
 */
export const CONTENT_FORMATS = ["video", "short-form", "long-form", "image"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export function buildPostTypeFilter(contentType: string | null): Record<string, unknown> {
  if (contentType === "video") {
    return { postType: { in: ["video", "short"] as PostType[] } };
  } else if (contentType === "short-form") {
    return {
      OR: [
        { postType: "short" },
        { platform: "tiktok", postType: "video" },
        { platform: "instagram", postType: "video" },
      ],
    };
  } else if (contentType === "long-form") {
    return { platform: "youtube", postType: "video" };
  } else if (contentType === "image") {
    // "image" rolls up single-image posts and TikTok slideshows into
    // one "non-video" bucket. Carousels stay separate.
    return { postType: { in: ["image", "slideshow"] as PostType[] } };
  }
  return {};
}
