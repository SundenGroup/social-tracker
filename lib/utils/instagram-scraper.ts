import type { Page } from "playwright";

const IG_APP_ID = "936619743392459";
const FEED_API_BASE = "https://www.instagram.com/api/v1/feed/user";
const PROFILE_API = "https://www.instagram.com/api/v1/users/web_profile_info";

export interface ScrapedInstagramPost {
  postId: string;
  mediaType: "image" | "video" | "carousel";
  isReel: boolean;
  caption: string;
  permalink: string;
  thumbnailUrl: string | null;
  publishedAt: number; // Unix timestamp
  likeCount: number;
  commentCount: number;
  playCount: number;
}

export interface ScrapedInstagramProfile {
  username: string;
  fullName: string;
  followers: number;
  following: number;
  postCount: number;
}

/**
 * Fetch a single page of posts from Instagram's internal feed API.
 * Must be called from a page with session cookies loaded.
 */
export async function fetchInstagramFeedPage(
  page: Page,
  userId: string,
  maxId?: string
): Promise<{ posts: ScrapedInstagramPost[]; nextMaxId: string | null }> {
  const url = maxId
    ? `${FEED_API_BASE}/${userId}/?count=12&max_id=${maxId}`
    : `${FEED_API_BASE}/${userId}/?count=12`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await page.evaluate(
    async ({ url, appId }) => {
      const res = await fetch(url, {
        headers: {
          "x-ig-app-id": appId,
          "x-requested-with": "XMLHttpRequest",
        },
        credentials: "include",
      });
      if (!res.ok) {
        return { error: res.status, statusText: res.statusText };
      }
      return res.json();
    },
    { url, appId: IG_APP_ID }
  );

  if (response.error) {
    throw new Error(
      `Instagram API returned ${response.error}: ${response.statusText}`
    );
  }

  const items = response.items ?? [];
  const posts: ScrapedInstagramPost[] = [];

  for (const item of items) {
    const post = parseInstagramItem(item);
    if (post) posts.push(post);
  }

  const nextMaxId = response.next_max_id ?? null;

  return { posts, nextMaxId };
}

/**
 * Fetch all posts up to maxPosts, paginating through the feed API.
 */
export async function fetchAllInstagramPosts(
  page: Page,
  userId: string,
  maxPosts = 200
): Promise<ScrapedInstagramPost[]> {
  const allPosts: ScrapedInstagramPost[] = [];
  let nextMaxId: string | null = null;
  let pageNum = 0;
  const maxPages = Math.ceil(maxPosts / 12) + 1;

  while (pageNum < maxPages && allPosts.length < maxPosts) {
    const { posts, nextMaxId: next } = await fetchInstagramFeedPage(
      page,
      userId,
      nextMaxId ?? undefined
    );

    allPosts.push(...posts);
    nextMaxId = next;
    pageNum++;

    if (!nextMaxId || posts.length === 0) break;

    // Rate limit: 1-2s between pages
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
  }

  return allPosts.slice(0, maxPosts);
}

/**
 * Resolve a username to a numeric Instagram user ID via the profile API.
 */
export async function resolveInstagramUserId(
  page: Page,
  username: string
): Promise<string> {
  const url = `${PROFILE_API}/?username=${username}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: any = await page.evaluate(
    async ({ url, appId }) => {
      const res = await fetch(url, {
        headers: {
          "x-ig-app-id": appId,
          "x-requested-with": "XMLHttpRequest",
        },
        credentials: "include",
      });
      if (!res.ok) {
        return { error: res.status, statusText: res.statusText };
      }
      return res.json();
    },
    { url, appId: IG_APP_ID }
  );

  if (response.error) {
    throw new Error(
      `Failed to resolve Instagram userId for @${username}: ${response.error}`
    );
  }

  const userId = response.data?.user?.id;
  if (!userId) {
    throw new Error(`Could not find user ID for @${username}`);
  }

  return String(userId);
}

/**
 * Fetch Instagram profile stats (followers, following, post count).
 */
export async function fetchInstagramProfile(
  page: Page,
  username: string
): Promise<ScrapedInstagramProfile> {
  const url = `${PROFILE_API}/?username=${username}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: any = await page.evaluate(
    async ({ url, appId }) => {
      const res = await fetch(url, {
        headers: {
          "x-ig-app-id": appId,
          "x-requested-with": "XMLHttpRequest",
        },
        credentials: "include",
      });
      if (!res.ok) {
        return { error: res.status, statusText: res.statusText };
      }
      return res.json();
    },
    { url, appId: IG_APP_ID }
  );

  if (response.error) {
    throw new Error(
      `Failed to fetch Instagram profile for @${username}: ${response.error}`
    );
  }

  const user = response.data?.user;
  if (!user) {
    throw new Error(`No user data found for @${username}`);
  }

  return {
    username: user.username ?? username,
    fullName: user.full_name ?? "",
    followers: user.edge_followed_by?.count ?? 0,
    following: user.edge_follow?.count ?? 0,
    postCount: user.edge_owner_to_timeline_media?.count ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseInstagramItem(item: any): ScrapedInstagramPost | null {
  if (!item.pk && !item.id) return null;

  const postId = String(item.pk ?? item.id);
  const code = item.code ?? "";

  // Determine media type
  let mediaType: "image" | "video" | "carousel" = "image";
  if (item.media_type === 2 || item.video_versions) mediaType = "video";
  if (item.media_type === 8 || item.carousel_media) mediaType = "carousel";

  const isReel = item.product_type === "clips" || item.product_type === "reels";

  // Caption
  const caption = item.caption?.text ?? "";

  // Thumbnail
  const thumbnailUrl =
    item.image_versions2?.candidates?.[0]?.url ??
    item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ??
    null;

  // Timestamps
  const publishedAt = item.taken_at ?? Math.floor(Date.now() / 1000);

  // Metrics (inline in feed response)
  const likeCount = item.like_count ?? 0;
  const commentCount = item.comment_count ?? 0;
  const playCount = item.play_count ?? item.view_count ?? 0;

  return {
    postId,
    mediaType,
    isReel,
    caption,
    permalink: code
      ? `https://www.instagram.com/p/${code}/`
      : `https://www.instagram.com/p/${postId}/`,
    thumbnailUrl,
    publishedAt,
    likeCount,
    commentCount,
    playCount,
  };
}
