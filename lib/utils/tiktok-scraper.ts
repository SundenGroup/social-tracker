import type { Page } from "playwright";

export interface ScrapedTikTokVideo {
  videoId: string;
  description: string;
  coverUrl: string | null;
  permalink: string;
  views: number;
  createTime?: number;
}

export interface ScrapedTikTokMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
}

export interface ScrapedTikTokProfile {
  username: string;
  followers: number;
  following: number;
  totalLikes: number;
  videoCount: number;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Extract videos from TikTok profile page.
 * TikTok embeds JSON data in a script tag with id="__UNIVERSAL_DATA_FOR_REHYDRATION__"
 * or similar, which contains structured video data.
 */
export async function extractVideosFromDOM(
  page: Page,
  username: string,
  maxVideos = 50
): Promise<ScrapedTikTokVideo[]> {
  const videos: ScrapedTikTokVideo[] = [];

  // First, try to extract from embedded JSON data
  const jsonVideos = await tryExtractFromJSON(page, username);
  if (jsonVideos.length > 0) {
    return jsonVideos.slice(0, maxVideos);
  }

  // Fallback: extract from DOM
  const seen = new Set<string>();
  let scrollAttempts = 0;
  const maxScrolls = 10;

  while (videos.length < maxVideos && scrollAttempts < maxScrolls) {
    const videoElements = await page.$$('[data-e2e="user-post-item"], [class*="DivItemContainer"]');

    for (const el of videoElements) {
      if (videos.length >= maxVideos) break;

      try {
        const linkEl = await el.$("a");
        if (!linkEl) continue;

        const href = await linkEl.getAttribute("href");
        if (!href) continue;

        const match = href.match(/\/video\/(\d+)/);
        if (!match) continue;

        const videoId = match[1];
        if (seen.has(videoId)) continue;
        seen.add(videoId);

        // Try to get description
        const descEl = await el.$('[class*="DivDesContainer"], [data-e2e="user-post-item-desc"]');
        const description = descEl ? await descEl.innerText() : "";

        // Try to get view count from overlay
        const viewEl = await el.$('[data-e2e="video-views"], [class*="SpanCount"]');
        const viewText = viewEl ? await viewEl.innerText() : "0";
        const views = parseCompactNumber(viewText);

        // Try to get cover image
        const imgEl = await el.$("img");
        const coverUrl = imgEl ? await imgEl.getAttribute("src") : null;

        videos.push({
          videoId,
          description,
          coverUrl,
          permalink: `https://www.tiktok.com/@${username}/video/${videoId}`,
          views,
        });
      } catch {
        // Skip individual video parsing errors
      }
    }

    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(2000 + Math.random() * 1000);
    scrollAttempts++;
  }

  return videos;
}

/**
 * Try to extract video data from TikTok's embedded JSON hydration data.
 */
async function tryExtractFromJSON(
  page: Page,
  username: string
): Promise<ScrapedTikTokVideo[]> {
  try {
    const jsonContent = await page.evaluate(() => {
      const scriptEl =
        document.querySelector("#__UNIVERSAL_DATA_FOR_REHYDRATION__") ??
        document.querySelector("#SIGI_STATE") ??
        document.querySelector('script[id*="SIGI"]');
      return scriptEl?.textContent ?? null;
    });

    if (!jsonContent) return [];

    const data = JSON.parse(jsonContent);
    const videos: ScrapedTikTokVideo[] = [];

    // Navigate the JSON structure to find video items
    const items = findVideoItems(data);

    for (const item of items) {
      if (!item.id) continue;

      videos.push({
        videoId: String(item.id),
        description: item.desc ?? item.description ?? "",
        coverUrl: item.video?.cover ?? item.video?.originCover ?? null,
        permalink: `https://www.tiktok.com/@${username}/video/${item.id}`,
        views: Number(item.stats?.playCount ?? item.video?.playCount ?? 0),
        createTime: item.createTime ? Number(item.createTime) : undefined,
      });
    }

    return videos;
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findVideoItems(obj: any): any[] {
  if (!obj || typeof obj !== "object") return [];

  // Look for arrays of items with 'id' and 'desc' or 'video' keys
  if (Array.isArray(obj)) {
    if (obj.length > 0 && obj[0]?.id && (obj[0]?.desc !== undefined || obj[0]?.video)) {
      return obj;
    }
    for (const item of obj) {
      const result = findVideoItems(item);
      if (result.length > 0) return result;
    }
    return [];
  }

  // Check known TikTok JSON paths
  if (obj.ItemModule) {
    return Object.values(obj.ItemModule);
  }

  for (const value of Object.values(obj)) {
    const result = findVideoItems(value);
    if (result.length > 0) return result;
  }

  return [];
}

/**
 * Extract metrics from an individual TikTok video page.
 */
export async function extractMetricsFromPage(
  page: Page,
  videoUrl: string
): Promise<ScrapedTikTokMetrics> {
  const metrics: ScrapedTikTokMetrics = {};

  try {
    await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(2000);

    // Try to extract from embedded JSON first
    const jsonContent = await page.evaluate(() => {
      const scriptEl =
        document.querySelector("#__UNIVERSAL_DATA_FOR_REHYDRATION__") ??
        document.querySelector("#SIGI_STATE");
      return scriptEl?.textContent ?? null;
    });

    if (jsonContent) {
      try {
        const data = JSON.parse(jsonContent);
        const stats = findVideoStats(data);
        if (stats) return stats;
      } catch {
        // Fall through to DOM extraction
      }
    }

    // Fallback: extract from DOM
    const selectors = {
      likes: '[data-e2e="like-count"], [data-e2e="browse-like-count"]',
      comments: '[data-e2e="comment-count"], [data-e2e="browse-comment-count"]',
      shares: '[data-e2e="share-count"]',
    };

    for (const [key, selector] of Object.entries(selectors)) {
      const el = await page.$(selector);
      if (el) {
        const text = await el.innerText();
        const value = parseCompactNumber(text);
        if (value > 0) {
          (metrics as Record<string, number>)[key] = value;
        }
      }
    }
  } catch {
    // Return whatever we've collected
  }

  return metrics;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findVideoStats(obj: any): ScrapedTikTokMetrics | null {
  if (!obj || typeof obj !== "object") return null;

  if (
    "playCount" in obj &&
    ("diggCount" in obj || "likeCount" in obj)
  ) {
    return {
      views: Number(obj.playCount ?? 0),
      likes: Number(obj.diggCount ?? obj.likeCount ?? 0),
      comments: Number(obj.commentCount ?? 0),
      shares: Number(obj.shareCount ?? 0),
    };
  }

  for (const value of Object.values(obj)) {
    if (typeof value === "object" && value !== null) {
      const result = findVideoStats(value);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Extract profile stats from TikTok profile page.
 */
export async function extractProfileStats(
  page: Page
): Promise<ScrapedTikTokProfile | null> {
  try {
    // Try JSON extraction first
    const jsonContent = await page.evaluate(() => {
      const scriptEl =
        document.querySelector("#__UNIVERSAL_DATA_FOR_REHYDRATION__") ??
        document.querySelector("#SIGI_STATE");
      return scriptEl?.textContent ?? null;
    });

    if (jsonContent) {
      try {
        const data = JSON.parse(jsonContent);
        const stats = findProfileStats(data);
        if (stats) return stats;
      } catch {
        // Fall through
      }
    }

    // Fallback: DOM extraction
    let followers = 0;
    let following = 0;
    let totalLikes = 0;

    const statsEls = await page.$$('[data-e2e="followers-count"], [data-e2e="following-count"], [data-e2e="likes-count"]');
    for (const el of statsEls) {
      const testId = await el.getAttribute("data-e2e");
      const text = await el.innerText();
      const value = parseCompactNumber(text);

      if (testId === "followers-count") followers = value;
      else if (testId === "following-count") following = value;
      else if (testId === "likes-count") totalLikes = value;
    }

    return {
      username: "",
      followers,
      following,
      totalLikes,
      videoCount: 0,
    };
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findProfileStats(obj: any): ScrapedTikTokProfile | null {
  if (!obj || typeof obj !== "object") return null;

  if ("followerCount" in obj && "followingCount" in obj) {
    return {
      username: obj.uniqueId ?? obj.nickname ?? "",
      followers: Number(obj.followerCount ?? 0),
      following: Number(obj.followingCount ?? 0),
      totalLikes: Number(obj.heartCount ?? obj.heart ?? 0),
      videoCount: Number(obj.videoCount ?? 0),
    };
  }

  for (const value of Object.values(obj)) {
    if (typeof value === "object" && value !== null) {
      const result = findProfileStats(value);
      if (result) return result;
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
