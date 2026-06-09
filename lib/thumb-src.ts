/**
 * Client-safe thumbnail URL resolver.
 *
 * Decides what a post's <img src> should point at. The goal is that a
 * thumbnail is ALWAYS available and never breaks:
 *
 *   - YouTube / Twitter / VK store stable CDN URLs that never expire,
 *     so we use them directly (no proxy hop).
 *   - TikTok and Instagram serve SIGNED URLs that expire after a few
 *     weeks. Once a post leaves the daily-refresh window its URL dies
 *     and the dashboard shows a blank box. Those route through the
 *     caching proxy at /api/thumb/[id], which keeps a permanent copy
 *     on disk and serves a branded placeholder if the source is gone.
 *   - Anything with no stored thumbnail at all also routes through the
 *     proxy, which returns the placeholder.
 *
 * Pure + dependency-free so it can be imported by client components.
 */

export interface ThumbnailPost {
  id: string;
  platform: string;
  thumbnailUrl?: string | null;
}

// Platforms whose stored URL is fetchable directly by the user's
// browser, so we hot-link it (fast, no proxy hop):
//   - youtube / twitter / vk: stable, never expire.
//   - instagram: the URL expires after ~weeks, but a normal browser IP
//     CAN fetch it (only the datacenter IP is 403'd), so we use it
//     directly and fall back to the proxy on error (which serves a
//     Mac-uploaded permanent copy, or the placeholder).
// TikTok is deliberately NOT here: the droplet CAN fetch TikTok, so we
// route it through the proxy to capture a permanent copy before the
// signed URL expires.
const DIRECT_PLATFORMS = new Set(["youtube", "twitter", "vk", "instagram"]);

export function thumbSrc(post: ThumbnailPost): string {
  if (DIRECT_PLATFORMS.has(post.platform) && post.thumbnailUrl) {
    return post.thumbnailUrl;
  }
  // tiktok (cache via droplet) or any post missing a thumbnail.
  return `/api/thumb/${post.id}`;
}

/** Proxy URL — used as the onError fallback for direct-URL platforms so
 *  a dead/expired stable URL still resolves to a cached copy or the
 *  branded placeholder instead of a broken image. */
export function thumbProxySrc(id: string): string {
  return `/api/thumb/${id}`;
}
