#!/usr/bin/env npx tsx
/**
 * TikTok Remote Scraper
 *
 * Runs on a MacBook with residential IP to bypass TikTok's anti-bot.
 * Uses a PERSISTENT browser profile so cookies, session data, and
 * CAPTCHA solutions are saved between runs. First run: you may need
 * to accept cookie consent and solve a CAPTCHA manually. After that,
 * subsequent runs should work automatically.
 *
 * Setup:
 *   1. npm install (in this directory)
 *   2. Copy .env.example to .env and fill in values
 *   3. npx playwright install chromium
 *   4. npx tsx scrape.ts --setup    (first time — pauses so you can accept cookies / solve CAPTCHA)
 *   5. npx tsx scrape.ts            (subsequent runs — fully automatic)
 *
 * Schedule via launchd or cron for daily runs.
 */

import { chromium, type Page, type BrowserContext } from "playwright";
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
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "pubg.esports.official";
const TIKTOK_COOKIES = process.env.TIKTOK_COOKIES || ""; // "name=value; name2=value2"
const MAX_VIDEOS = parseInt(process.env.MAX_VIDEOS || "200", 10);

// Persistent browser profile directory — keeps cookies/state between runs
const PROFILE_DIR = path.join(SCRIPT_DIR, "browser-profile");

// --setup flag: pauses at each step so you can interact with the browser
const SETUP_MODE = process.argv.includes("--setup");

/** Pause and wait for user to press Enter in the terminal */
function waitForEnter(message: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n>>> ${message} Press ENTER to continue...`, () => {
      rl.close();
      resolve();
    });
  });
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

async function main() {
  if (!API_TOKEN) {
    console.error("ERROR: API_TOKEN not set in .env");
    process.exit(1);
  }

  console.log(`[TikTok Scraper] Starting for @${TIKTOK_USERNAME}...`);
  console.log(`[TikTok Scraper] Target: ${API_URL}/api/sync/ingest`);
  console.log(`[TikTok Scraper] Browser profile: ${PROFILE_DIR}`);

  const isFirstRun = !fs.existsSync(PROFILE_DIR);
  const interactive = SETUP_MODE || isFirstRun;

  if (interactive) {
    console.log("[TikTok Scraper] INTERACTIVE MODE — the script will pause so you can interact with the browser.");
    console.log("[TikTok Scraper] Accept cookie consent, solve CAPTCHAs, then press Enter in this terminal.");
  }

  // Use persistent context — saves cookies, localStorage, session between runs
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });

  // Hide webdriver
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  // Load cookies from .env on first run only
  if (isFirstRun && TIKTOK_COOKIES) {
    const cookies = parseCookieString(TIKTOK_COOKIES, ".tiktok.com");
    await context.addCookies(cookies);
    console.log(`[TikTok Scraper] Loaded ${cookies.length} cookies from .env`);
  }

  const page = context.pages()[0] || await context.newPage();

  // Warm up — visit homepage first
  console.log("[TikTok Scraper] Warming up on homepage...");
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

  // Navigate to profile
  console.log(`[TikTok Scraper] Loading @${TIKTOK_USERNAME} profile...`);
  await page.goto(`https://www.tiktok.com/@${TIKTOK_USERNAME}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  if (interactive) {
    await waitForEnter("Profile loaded. Solve CAPTCHA if needed, make sure you see the video grid.");
  } else {
    await page.waitForTimeout(6000);
    await waitForCaptcha(page, "profile");
  }

  // Scroll to load more videos
  console.log("[TikTok Scraper] Scrolling to load videos...");
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
      if (i % 5 === 0) console.log(`[TikTok Scraper] ... ${currentCount} videos loaded`);
    }
    prevVideoCount = currentCount;
  }

  // Extract data from hydration JSON
  console.log("[TikTok Scraper] Extracting hydration data...");
  const videos = await extractVideos(page, TIKTOK_USERNAME);

  // Also try DOM fallback for video IDs + view counts
  if (videos.length === 0) {
    console.log("[TikTok Scraper] Hydration empty, trying DOM extraction...");
    const domVideos = await extractFromDOM(page, TIKTOK_USERNAME);
    videos.push(...domVideos);
  }

  console.log(`[TikTok Scraper] Extracted ${videos.length} videos`);

  if (videos.length === 0) {
    await page.screenshot({ path: path.join(SCRIPT_DIR, "debug-screenshot.png") });
    console.log("[TikTok Scraper] No videos found. Debug screenshot saved.");
    await context.close();
    process.exit(1);
  }

  await context.close();

  // Push to production API
  console.log(`[TikTok Scraper] Pushing ${videos.length} videos to ${API_URL}...`);

  const response = await fetch(`${API_URL}/api/sync/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({
      platform: "tiktok",
      accountId: TIKTOK_USERNAME,
      posts: videos,
    }),
  });

  const responseText = await response.text();
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(responseText);
  } catch {
    console.error(`[TikTok Scraper] API returned non-JSON (${response.status}): ${responseText.slice(0, 200)}`);
    process.exit(1);
  }

  if (response.ok) {
    console.log(`[TikTok Scraper] Success! Posts: ${result.postsSynced}, Metrics: ${result.metricsSynced}`);
  } else {
    console.error(`[TikTok Scraper] API error ${response.status}:`, result);
    process.exit(1);
  }
}

/**
 * Wait for CAPTCHA to be solved manually.
 * Polls every 3s for up to 60s, checking if CAPTCHA text disappears.
 */
async function waitForCaptcha(page: Page, location: string) {
  const hasCaptcha = await page.evaluate(() =>
    document.body.innerText.includes("Drag the slider") ||
    document.body.innerText.includes("Verify") ||
    document.body.innerText.includes("Select 2 objects")
  );

  if (!hasCaptcha) return;

  console.log(`[TikTok Scraper] CAPTCHA detected on ${location} — please solve it manually...`);

  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(3000);
    const stillCaptcha = await page.evaluate(() =>
      document.body.innerText.includes("Drag the slider") ||
      document.body.innerText.includes("Verify") ||
      document.body.innerText.includes("Select 2 objects")
    );
    if (!stillCaptcha) {
      console.log(`[TikTok Scraper] CAPTCHA solved! Continuing...`);
      await page.waitForTimeout(2000);
      return;
    }
  }

  console.log("[TikTok Scraper] CAPTCHA timeout (60s) — continuing anyway...");
}

async function extractVideos(page: Page, username: string): Promise<ScrapedVideo[]> {
  const data = await page.evaluate(() => {
    const el = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
    if (!el?.textContent) return null;
    return JSON.parse(el.textContent);
  });

  if (!data) return [];

  const userDetail = data?.__DEFAULT_SCOPE__?.["webapp.user-detail"];
  const items = userDetail?.itemList;
  if (!Array.isArray(items)) return [];

  return items.map((item: Record<string, unknown>) => {
    const stats = item.stats as Record<string, number> | undefined;
    const video = item.video as Record<string, unknown> | undefined;
    const createTime = Number(item.createTime || 0);

    return {
      postId: String(item.id),
      title: String(item.desc || "").slice(0, 200),
      description: String(item.desc || ""),
      contentUrl: `https://www.tiktok.com/@${username}/video/${item.id}`,
      thumbnailUrl: (video?.cover as string) || (video?.originCover as string) || null,
      publishedAt: createTime > 0 ? new Date(createTime * 1000).toISOString() : new Date().toISOString(),
      postType: "video",
      metrics: {
        views: Number(stats?.playCount || 0),
        likes: Number(stats?.diggCount || 0),
        comments: Number(stats?.commentCount || 0),
        shares: Number(stats?.shareCount || 0),
      },
    };
  });
}

async function extractFromDOM(page: Page, username: string): Promise<ScrapedVideo[]> {
  // Extract raw data from browser, process in Node.js to avoid tsx/esbuild __name issues
  const rawItems: { videoId: string; viewText: string }[] = await page.$$eval(
    'a[href*="/video/"]',
    (els) => {
      const seen: Record<string, boolean> = {};
      const items: { videoId: string; viewText: string }[] = [];
      for (const el of els) {
        const href = el.getAttribute("href") || "";
        const m = href.match(/\/video\/(\d+)/);
        if (!m) continue;
        const vid = m[1];
        if (seen[vid]) continue;
        seen[vid] = true;
        const card = el.closest('[class*="DivItemContainer"], [data-e2e="user-post-item"]') || el.parentElement;
        const viewEl = card?.querySelector('strong[data-e2e="video-views"], [class*="video-count"]');
        items.push({ videoId: vid, viewText: viewEl?.textContent || "0" });
      }
      return items;
    }
  );

  return rawItems.map((item) => ({
    postId: item.videoId,
    title: "",
    description: "",
    contentUrl: `https://www.tiktok.com/@${username}/video/${item.videoId}`,
    thumbnailUrl: null,
    publishedAt: new Date().toISOString(),
    postType: "video",
    metrics: {
      views: parseCompact(item.viewText),
      likes: 0,
      comments: 0,
      shares: 0,
    },
  }));
}

function parseCompact(text: string): number {
  const cleaned = text.replace(/[^0-9.KMBkmb]/g, "");
  const m = cleaned.match(/([\d.]+)\s*([KMBkmb])?/);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const suffix = (m[2] || "").toUpperCase();
  if (suffix === "K") return Math.round(num * 1000);
  if (suffix === "M") return Math.round(num * 1000000);
  if (suffix === "B") return Math.round(num * 1000000000);
  return Math.round(num);
}

function parseCookieString(cookieStr: string, domain: string) {
  return cookieStr
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return null;
      return {
        name: pair.slice(0, eq).trim(),
        value: pair.slice(eq + 1).trim(),
        domain,
        path: "/",
      };
    })
    .filter(Boolean) as { name: string; value: string; domain: string; path: string }[];
}

main().catch((err) => {
  console.error("[TikTok Scraper] Fatal error:", err);
  process.exit(1);
});
