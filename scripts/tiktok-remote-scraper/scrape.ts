#!/usr/bin/env npx tsx
/**
 * TikTok Remote Scraper
 *
 * Connects to a Chrome browser that's already running (started by browser-server.ts).
 * The browser stays open between runs — no more open/close/CAPTCHA cycles.
 *
 * Flow:
 *   1. Connect to running Chrome via WebSocket
 *   2. Load profile page, scroll to collect video IDs
 *   3. Visit each video page to get full details (title, date, metrics)
 *   4. Push results to the Clutch Social Tracker API
 *
 * Usage:
 *   First start the browser:  npx tsx browser-server.ts
 *   Then run scraper:         npx tsx scrape.ts
 *
 * Schedule the scraper via launchd or cron for daily runs.
 * The browser-server should be started once and left running.
 */

import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// Script directory
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);

// Load .env from this script's directory
const envPath = path.join(SCRIPT_DIR, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const API_URL = process.env.API_URL || "https://social.clutch.game";
const API_TOKEN = process.env.API_TOKEN || "";
// Support multiple accounts via TIKTOK_USERNAMES (comma-separated), fall back to single TIKTOK_USERNAME
const TIKTOK_USERNAMES: string[] = (
  process.env.TIKTOK_USERNAMES ||
  process.env.TIKTOK_USERNAME ||
  "pubg.esports.official"
).split(",").map((u) => u.trim()).filter(Boolean);
const MAX_VIDEOS = parseInt(process.env.MAX_VIDEOS || "200", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "3", 10);
const RETRY_DELAY_MIN = parseInt(process.env.RETRY_DELAY_MIN || "5", 10);

const WS_FILE = path.join(SCRIPT_DIR, ".browser-ws");
const CDP_FILE = path.join(SCRIPT_DIR, ".browser-cdp");
const PROFILE_DIR = path.join(SCRIPT_DIR, "browser-profile");
const TIKTOK_COOKIES = process.env.TIKTOK_COOKIES || "";
const SETUP_MODE = process.argv.includes("--setup");

function waitForEnter(message: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n>>> ${message} Press ENTER to continue...`, () => {
      rl.close();
      resolve();
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ScrapedVideo {
  postId: string;
  title: string;
  description: string;
  contentUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  postType: string;
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };
}

/**
 * Connect to the running browser, or launch one if browser-server isn't running.
 */
async function getBrowser(): Promise<{ browser: Browser | null; context: BrowserContext; standalone: boolean }> {
  // Try to connect to running browser-server via CDP
  const cdpFile = fs.existsSync(CDP_FILE) ? CDP_FILE : fs.existsSync(WS_FILE) ? WS_FILE : null;
  if (cdpFile) {
    const endpoint = fs.readFileSync(cdpFile, "utf-8").trim();
    try {
      const browser = await chromium.connectOverCDP(endpoint);
      const contexts = browser.contexts();
      const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
      console.log("[Scraper] Connected to running browser.");
      return { browser, context, standalone: false };
    } catch {
      console.log("[Scraper] Browser-server not reachable, launching standalone...");
    }
  } else {
    console.log("[Scraper] No browser-server found, launching standalone...");
  }

  // Fallback: launch standalone (old behavior)
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: "chrome",
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    });
  } catch {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    });
  }

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  return { browser: null, context, standalone: true };
}

/**
 * Single scrape attempt.
 */
interface ScrapeResult {
  videos: ScrapedVideo[];
  profileStats: { followers: number; following: number; videoCount: number } | null;
}

async function scrape(username: string): Promise<ScrapeResult> {
  const { browser, context, standalone } = await getBrowser();
  const interactive = SETUP_MODE;

  if (interactive) {
    console.log("[Scraper] INTERACTIVE MODE — script will pause so you can interact with the browser.");
  }

  try {
    // Get or create a page
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // --- Step 1: Collect video IDs from profile ---
    console.log("[Scraper] Warming up on homepage...");
    await page.goto("https://www.tiktok.com/foryou", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (interactive) {
      await waitForEnter("Homepage loaded. Accept cookie consent / solve CAPTCHA if needed.");
    } else {
      await page.waitForTimeout(4000);
      await waitForCaptcha(page, "homepage");
    }

    console.log(`[Scraper] Loading @${username} profile...`);
    await page.goto(`https://www.tiktok.com/@${username}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (interactive) {
      await waitForEnter("Profile loaded. Solve CAPTCHA if needed, make sure you see the video grid.");
    } else {
      await page.waitForTimeout(6000);
      await waitForCaptcha(page, "profile");
    }

    // Extract profile stats from hydration JSON
    let profileStats: { followers: number; following: number; videoCount: number } | null = null;
    try {
      profileStats = await page.evaluate(() => {
        const el = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
        if (!el || !el.textContent) return null;
        const data = JSON.parse(el.textContent);
        const scope = data["__DEFAULT_SCOPE__"];
        const userDetail = scope?.["webapp.user-detail"];
        const userInfo = userDetail?.userInfo;
        if (!userInfo?.stats) return null;
        return {
          followers: Number(userInfo.stats.followerCount || 0),
          following: Number(userInfo.stats.followingCount || 0),
          videoCount: Number(userInfo.stats.videoCount || 0),
        };
      });
      if (profileStats) {
        console.log(`[Scraper] Profile stats: ${profileStats.followers} followers, ${profileStats.videoCount} videos`);
      }
    } catch {
      console.log("[Scraper] Could not extract profile stats from hydration data");
    }

    console.log("[Scraper] Scrolling to load videos...");
    let prevVideoCount = 0;
    let staleScrolls = 0;

    for (let i = 0; i < 40; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await page.waitForTimeout(1500 + Math.random() * 1000);

      const currentCount = await page.$$eval(
        'a[href*="/video/"]',
        (els) => new Set(els.map((e) => e.getAttribute("href"))).size
      );

      if (currentCount >= MAX_VIDEOS) break;
      if (currentCount === prevVideoCount) {
        staleScrolls++;
        if (staleScrolls >= 5) break;
      } else {
        staleScrolls = 0;
        if (i % 5 === 0) console.log(`[Scraper] ... ${currentCount} videos loaded`);
      }
      prevVideoCount = currentCount;
    }

    // Get unique video IDs
    const videoIds: string[] = await page.$$eval('a[href*="/video/"]', (els) => {
      const seen: Record<string, boolean> = {};
      const ids: string[] = [];
      for (const el of els) {
        const href = el.getAttribute("href") || "";
        const m = href.match(/\/video\/(\d+)/);
        if (m && !seen[m[1]]) {
          seen[m[1]] = true;
          ids.push(m[1]);
        }
      }
      return ids;
    });

    console.log(`[Scraper] Found ${videoIds.length} video IDs on profile`);

    if (videoIds.length === 0) {
      await page.screenshot({ path: path.join(SCRIPT_DIR, "debug-screenshot.png") });
      throw new Error("No videos found on profile (CAPTCHA or page load issue)");
    }

    // --- Step 2: Visit each video page to get full details ---
    console.log(`[Scraper] Scraping details for ${videoIds.length} videos (this takes a few minutes)...`);
    const videos: ScrapedVideo[] = [];
    let failures = 0;

    for (let i = 0; i < videoIds.length; i++) {
      const videoId = videoIds[i];
      const videoUrl = `https://www.tiktok.com/@${username}/video/${videoId}`;

      try {
        await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(2000 + Math.random() * 1000);

        // Try hydration JSON first
        const videoData = await page.evaluate(() => {
          const el = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
          if (!el || !el.textContent) return null;
          const data = JSON.parse(el.textContent);
          const scope = data["__DEFAULT_SCOPE__"];
          const detail = scope?.["webapp.video-detail"];
          const item = detail?.itemInfo?.itemStruct;
          if (!item) return null;
          return {
            id: item.id,
            desc: item.desc || "",
            createTime: item.createTime,
            stats: item.stats,
            cover: item.video?.cover || item.video?.originCover || null,
          };
        });

        if (videoData && videoData.stats) {
          const createTime = Number(videoData.createTime || 0);
          videos.push({
            postId: videoData.id || videoId,
            title: String(videoData.desc || "").slice(0, 200),
            description: String(videoData.desc || ""),
            contentUrl: videoUrl,
            thumbnailUrl: videoData.cover,
            publishedAt: createTime > 0 ? new Date(createTime * 1000).toISOString() : new Date().toISOString(),
            postType: "video",
            metrics: {
              views: Number(videoData.stats.playCount || 0),
              likes: Number(videoData.stats.diggCount || 0),
              comments: Number(videoData.stats.commentCount || 0),
              shares: Number(videoData.stats.shareCount || 0),
            },
          });
        } else {
          // Fallback: extract from DOM
          const domData = await extractVideoFromDOM(page);
          if (domData) {
            videos.push({
              postId: videoId,
              title: domData.desc.slice(0, 200),
              description: domData.desc,
              contentUrl: videoUrl,
              thumbnailUrl: null,
              publishedAt: domData.date || new Date().toISOString(),
              postType: "video",
              metrics: {
                views: domData.views,
                likes: domData.likes,
                comments: domData.comments,
                shares: domData.shares,
              },
            });
          } else {
            failures++;
          }
        }

        if ((i + 1) % 20 === 0) {
          console.log(`[Scraper] ... ${i + 1}/${videoIds.length} videos scraped (${videos.length} successful)`);
        }
      } catch {
        failures++;
        if (failures > 10) {
          console.log(`[Scraper] Too many failures (${failures}), stopping early`);
          break;
        }
      }
    }

    console.log(`[Scraper] Scraped ${videos.length} videos with full details (${failures} failures)`);

    if (videos.length === 0) {
      throw new Error("Failed to scrape any video details");
    }

    // Navigate to a neutral page so browser isn't sitting on TikTok between runs
    await page.goto("about:blank").catch(() => {});

    return { videos, profileStats };
  } finally {
    // Only close if we launched standalone — don't kill the shared browser
    if (standalone) {
      await context.close();
    }
  }
}

/**
 * Extract video data from DOM as fallback.
 */
async function extractVideoFromDOM(page: Page): Promise<{
  desc: string;
  date: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
} | null> {
  return page.evaluate(() => {
    const descEl = document.querySelector(
      '[data-e2e="browse-video-desc"], [data-e2e="video-desc"], [class*="DivVideoInfoContainer"] span'
    );
    const likesEl = document.querySelector('[data-e2e="like-count"], [data-e2e="browse-like-count"]');
    const commentsEl = document.querySelector('[data-e2e="comment-count"], [data-e2e="browse-comment-count"]');
    const sharesEl = document.querySelector('[data-e2e="share-count"], [data-e2e="browse-share-count"]');
    const viewsEl = document.querySelector('[data-e2e="video-views"], [data-e2e="browse-video-views"]');
    const dateEl = document.querySelector('time, [class*="SpanOtherInfos"] span');

    const pc = (text: string | null | undefined): number => {
      if (!text) return 0;
      const cleaned = text.replace(/[^0-9.KMBkmb]/g, "");
      const m = cleaned.match(/([\d.]+)\s*([KMBkmb])?/);
      if (!m) return 0;
      const num = parseFloat(m[1]);
      const suffix = (m[2] || "").toUpperCase();
      if (suffix === "K") return Math.round(num * 1000);
      if (suffix === "M") return Math.round(num * 1000000);
      if (suffix === "B") return Math.round(num * 1000000000);
      return Math.round(num);
    };

    const likes = pc(likesEl?.textContent);
    const comments = pc(commentsEl?.textContent);
    const shares = pc(sharesEl?.textContent);
    const views = pc(viewsEl?.textContent);

    if (likes === 0 && comments === 0 && shares === 0 && views === 0) return null;

    return {
      desc: descEl?.textContent?.slice(0, 500) || "",
      date: dateEl?.getAttribute("datetime") || dateEl?.textContent || null,
      views,
      likes,
      comments,
      shares,
    };
  });
}

/**
 * Push scraped videos to the production API.
 */
async function pushToAPI(
  username: string,
  videos: ScrapedVideo[],
  profileStats?: { followers: number; following: number; videoCount: number } | null
): Promise<void> {
  console.log(`[Scraper] Pushing ${videos.length} videos for @${username} to ${API_URL}...`);

  const payload: Record<string, unknown> = {
    platform: "tiktok",
    accountId: username,
    posts: videos,
  };

  if (profileStats) {
    payload.stats = {
      followers: profileStats.followers,
      following: profileStats.following,
      videoCount: profileStats.videoCount,
    };
  }

  const response = await fetch(`${API_URL}/api/sync/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(`API returned non-JSON (${response.status}): ${responseText.slice(0, 200)}`);
  }

  if (response.ok) {
    console.log(`[Scraper] Success! Posts: ${result.postsSynced}, Metrics: ${result.metricsSynced}`);
  } else {
    throw new Error(`API error ${response.status}: ${JSON.stringify(result)}`);
  }
}

/**
 * Main entry point with retry logic.
 */
async function main() {
  if (!API_TOKEN) {
    console.error("ERROR: API_TOKEN not set in .env");
    process.exit(1);
  }

  console.log(`[Scraper] TikTok scraper for ${TIKTOK_USERNAMES.length} account(s): ${TIKTOK_USERNAMES.map((u) => `@${u}`).join(", ")}`);
  console.log(`[Scraper] Target: ${API_URL}/api/sync/ingest`);
  console.log(`[Scraper] Max videos: ${MAX_VIDEOS} | Retries: ${MAX_RETRIES} | Delay: ${RETRY_DELAY_MIN}min`);

  let hasFailure = false;

  for (const username of TIKTOK_USERNAMES) {
    console.log(`\n[Scraper] ========== @${username} ==========`);

    let success = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[Scraper] === Attempt ${attempt}/${MAX_RETRIES} for @${username} ===`);
        const { videos, profileStats } = await scrape(username);
        await pushToAPI(username, videos, profileStats);
        console.log(`[Scraper] @${username} completed successfully on attempt ${attempt}.`);
        success = true;
        break;
      } catch (err) {
        console.error(`[Scraper] @${username} attempt ${attempt} failed:`, err instanceof Error ? err.message : err);
        if (attempt < MAX_RETRIES) {
          console.log(`[Scraper] Waiting ${RETRY_DELAY_MIN} minutes before retry...`);
          await sleep(RETRY_DELAY_MIN * 60 * 1000);
        }
      }
    }

    if (!success) {
      console.error(`[Scraper] All ${MAX_RETRIES} attempts failed for @${username}.`);
      hasFailure = true;
    }
  }

  if (hasFailure) {
    console.error("[Scraper] Some accounts failed to scrape.");
    process.exit(1);
  }

  console.log("[Scraper] All accounts scraped successfully!");
}

async function waitForCaptcha(page: Page, location: string) {
  const hasCaptcha = await page.evaluate(() =>
    document.body.innerText.includes("Drag the slider") ||
    document.body.innerText.includes("Verify") ||
    document.body.innerText.includes("Select 2 objects")
  );

  if (!hasCaptcha) return;
  console.log(`[Scraper] CAPTCHA detected on ${location} — waiting for it to clear...`);

  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(3000);
    const stillCaptcha = await page.evaluate(() =>
      document.body.innerText.includes("Drag the slider") ||
      document.body.innerText.includes("Verify") ||
      document.body.innerText.includes("Select 2 objects")
    );
    if (!stillCaptcha) {
      console.log(`[Scraper] CAPTCHA cleared!`);
      await page.waitForTimeout(2000);
      return;
    }
  }

  throw new Error(`CAPTCHA on ${location} did not clear after 60s`);
}

main().catch((err) => {
  console.error("[Scraper] Fatal error:", err);
  process.exit(1);
});
