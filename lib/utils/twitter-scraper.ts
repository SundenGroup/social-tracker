import type { Page } from "playwright";

export interface ScrapedPost {
  postId: string;
  text: string;
  publishedAt: string;
  hasVideo: boolean;
  hasImage: boolean;
  permalink: string;
}

export interface ScrapedMetrics {
  views?: number;
  likes?: number;
  retweets?: number;
  replies?: number;
  bookmarks?: number;
}

export interface ScrapedProfile {
  username: string;
  displayName: string;
  followers: number;
  following: number;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Extract posts from a Twitter/X profile timeline page.
 */
export async function extractPostsFromTimeline(
  page: Page,
  username: string,
  maxPosts = 50
): Promise<ScrapedPost[]> {
  const posts: ScrapedPost[] = [];
  const seen = new Set<string>();

  // Scroll and collect posts
  let scrollAttempts = 0;
  const maxScrolls = Math.max(10, Math.ceil(maxPosts / 5)); // ~5 posts per scroll
  let noNewPostsCount = 0;

  while (posts.length < maxPosts && scrollAttempts < maxScrolls) {
    const prevCount = posts.length;
    // Extract tweet articles from the current viewport
    const tweetElements = await page.$$('article[data-testid="tweet"]');

    for (const tweet of tweetElements) {
      if (posts.length >= maxPosts) break;

      try {
        // Extract post link to get the post ID
        const linkEl = await tweet.$('a[href*="/status/"]');
        if (!linkEl) continue;

        const href = await linkEl.getAttribute("href");
        if (!href) continue;

        const match = href.match(/\/status\/(\d+)/);
        if (!match) continue;

        const postId = match[1];
        if (seen.has(postId)) continue;
        seen.add(postId);

        // Extract text
        const textEl = await tweet.$('[data-testid="tweetText"]');
        const text = textEl ? (await textEl.innerText()) : "";

        // Extract timestamp
        const timeEl = await tweet.$("time");
        const publishedAt = timeEl
          ? (await timeEl.getAttribute("datetime")) ?? new Date().toISOString()
          : new Date().toISOString();

        // Detect media type
        const videoEl = await tweet.$('[data-testid="videoPlayer"]');
        const hasVideo = !!videoEl;
        const imageEl = await tweet.$('[data-testid="tweetPhoto"]');
        const hasImage = !!imageEl;

        posts.push({
          postId,
          text,
          publishedAt,
          hasVideo,
          hasImage,
          permalink: `https://x.com/${username}/status/${postId}`,
        });
      } catch {
        // Skip individual tweet parsing errors
      }
    }

    // Stop early if timeline stopped loading new posts
    if (posts.length === prevCount) {
      noNewPostsCount++;
      if (noNewPostsCount >= 3) break;
    } else {
      noNewPostsCount = 0;
    }

    // Scroll down to load more
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(2000 + Math.random() * 1000);
    scrollAttempts++;
  }

  return posts;
}

/**
 * Extract metrics from an individual post page.
 */
export async function extractMetricsFromPost(
  page: Page,
  postUrl: string
): Promise<ScrapedMetrics> {
  const metrics: ScrapedMetrics = {};

  try {
    await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(2000);

    // Try to extract metrics from aria-labels on engagement buttons
    const groups = await page.$$('[role="group"]');

    for (const group of groups) {
      const buttons = await group.$$("button");
      for (const button of buttons) {
        const ariaLabel = await button.getAttribute("aria-label");
        if (!ariaLabel) continue;

        const lower = ariaLabel.toLowerCase();
        const numMatch = ariaLabel.match(/([\d,]+)/);
        if (!numMatch) continue;
        const value = parseInt(numMatch[1].replace(/,/g, ""), 10);

        if (lower.includes("repl")) metrics.replies = value;
        else if (lower.includes("repost") || lower.includes("retweet"))
          metrics.retweets = value;
        else if (lower.includes("like")) metrics.likes = value;
        else if (lower.includes("bookmark")) metrics.bookmarks = value;
        else if (lower.includes("view")) metrics.views = value;
      }
    }

    // Try to find view count in analytics link
    const analyticsLinks = await page.$$('a[href*="/analytics"]');
    for (const link of analyticsLinks) {
      const ariaLabel = await link.getAttribute("aria-label");
      if (ariaLabel) {
        const numMatch = ariaLabel.match(/([\d,]+)/);
        if (numMatch) {
          metrics.views = parseInt(numMatch[1].replace(/,/g, ""), 10);
        }
      }
    }
  } catch {
    // Return whatever we've collected so far
  }

  return metrics;
}

/**
 * Extract metrics from X's internal GraphQL TweetDetail response.
 * Intercepts network responses while loading a tweet page.
 */
export async function extractMetricsFromGraphQL(
  page: Page,
  postUrl: string
): Promise<ScrapedMetrics> {
  const metrics: ScrapedMetrics = {};

  const graphQLPromise = new Promise<ScrapedMetrics>((resolve) => {
    const timeout = setTimeout(() => {
      page.removeListener("response", handler);
      resolve(metrics);
    }, 10000);

    const handler = async (response: { url: () => string; json: () => Promise<unknown> }) => {
      const url = response.url();
      if (!url.includes("/TweetDetail") && !url.includes("/TweetResultByRestId"))
        return;

      try {
        const json = await response.json();
        const result = findTweetMetrics(json);
        if (result) {
          clearTimeout(timeout);
          page.removeListener("response", handler);
          resolve(result);
        }
      } catch {
        // Not JSON or parsing error
      }
    };

    page.on("response", handler);
  });

  await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

  return graphQLPromise;
}

function findTweetMetrics(obj: unknown): ScrapedMetrics | null {
  if (!obj || typeof obj !== "object") return null;

  const record = obj as Record<string, unknown>;

  // X's GraphQL structure: { legacy: { favorite_count, ... }, views: { count: "123" } }
  // The metrics are in "legacy" but views is a sibling, so check for both patterns
  if (
    "favorite_count" in record ||
    "retweet_count" in record ||
    "reply_count" in record
  ) {
    return {
      likes: (record.favorite_count as number) ?? undefined,
      retweets: (record.retweet_count as number) ?? undefined,
      replies: (record.reply_count as number) ?? undefined,
      bookmarks: (record.bookmark_count as number) ?? undefined,
      views:
        typeof record.views === "object" && record.views
          ? (Number((record.views as Record<string, unknown>).count) || undefined)
          : undefined,
    };
  }

  // Check for parent objects that have both "legacy" (with metrics) and "views" (sibling)
  if ("legacy" in record && typeof record.legacy === "object" && record.legacy) {
    const legacy = record.legacy as Record<string, unknown>;
    if ("favorite_count" in legacy) {
      return {
        likes: (legacy.favorite_count as number) ?? undefined,
        retweets: (legacy.retweet_count as number) ?? undefined,
        replies: (legacy.reply_count as number) ?? undefined,
        bookmarks: (legacy.bookmark_count as number) ?? undefined,
        views:
          typeof record.views === "object" && record.views
            ? (Number((record.views as Record<string, unknown>).count) || undefined)
            : undefined,
      };
    }
  }

  // Recursively search nested objects
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const result = findTweetMetrics(item);
          if (result) return result;
        }
      } else {
        const result = findTweetMetrics(value);
        if (result) return result;
      }
    }
  }

  return null;
}

/**
 * Extract profile stats from a Twitter/X profile page via DOM scraping.
 * Prefer using listenForProfileGraphQL() for more reliable extraction.
 */
export async function extractProfileStats(
  page: Page
): Promise<ScrapedProfile | null> {
  try {
    await page.waitForSelector('[data-testid="UserName"]', { timeout: 5000 });

    const displayNameEl = await page.$('[data-testid="UserName"] span');
    const displayName = displayNameEl
      ? await displayNameEl.innerText()
      : "Unknown";

    let followers = 0;
    let following = 0;

    const links = await page.$$("a");
    for (const link of links) {
      const href = await link.getAttribute("href");
      const text = await link.innerText();

      if (href?.endsWith("/followers")) {
        followers = parseCompactNumber(text);
      } else if (href?.endsWith("/following")) {
        following = parseCompactNumber(text);
      }
    }

    return {
      username: displayName,
      displayName,
      followers,
      following,
    };
  } catch {
    return null;
  }
}

/**
 * Set up a passive listener for X's UserByScreenName GraphQL response.
 * Call this BEFORE navigating to a profile page, then await the returned promise
 * after navigation to get the result.
 */
export function listenForProfileGraphQL(
  page: Page,
  timeoutMs = 15000
): Promise<ScrapedProfile | null> {
  return new Promise<ScrapedProfile | null>((resolve) => {
    const timeout = setTimeout(() => {
      page.removeListener("response", handler);
      resolve(null);
    }, timeoutMs);

    const handler = async (response: {
      url: () => string;
      json: () => Promise<unknown>;
    }) => {
      const url = response.url();
      if (
        !url.includes("/UserByScreenName") &&
        !url.includes("/UserTweets") &&
        !url.includes("/UsersByRestIds")
      )
        return;

      try {
        const json = await response.json();
        const stats = findUserStats(json);
        if (stats) {
          clearTimeout(timeout);
          page.removeListener("response", handler);
          resolve(stats);
        }
      } catch {
        // Not JSON or parsing error
      }
    };

    page.on("response", handler);
  });
}

/**
 * Recursively search X's GraphQL response for user stats (followers_count, etc.)
 */
function findUserStats(obj: unknown): ScrapedProfile | null {
  if (!obj || typeof obj !== "object") return null;

  const record = obj as Record<string, unknown>;

  // X GraphQL user result: { legacy: { followers_count, friends_count, name, screen_name } }
  if ("followers_count" in record && "friends_count" in record) {
    return {
      username: (record.screen_name as string) ?? "Unknown",
      displayName: (record.name as string) ?? "Unknown",
      followers: (record.followers_count as number) ?? 0,
      following: (record.friends_count as number) ?? 0,
    };
  }

  // Recurse into nested objects
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const result = findUserStats(item);
          if (result) return result;
        }
      } else {
        const result = findUserStats(value);
        if (result) return result;
      }
    }
  }

  return null;
}

/**
 * Parse compact numbers like "1.2M", "45.3K", "892".
 */
function parseCompactNumber(text: string): number {
  const cleaned = text.replace(/[^0-9.KMBkmb]/g, "");
  const match = cleaned.match(/([\d.]+)\s*([KMBkmb])?/);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  const suffix = (match[2] ?? "").toUpperCase();

  switch (suffix) {
    case "K":
      return Math.round(num * 1_000);
    case "M":
      return Math.round(num * 1_000_000);
    case "B":
      return Math.round(num * 1_000_000_000);
    default:
      return Math.round(num);
  }
}
