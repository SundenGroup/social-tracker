#!/usr/bin/env npx tsx
/**
 * Refresh a specific list of TikTok posts by URL.
 *
 * The daily scraper only revisits the latest ~MAX_VIDEOS posts per
 * profile, so older posts' metrics go stale once they fall out of that
 * window. This script lets us target any post by URL and refresh its
 * view / like / comment / share counts on demand.
 *
 * Reads URLs from a file (one per line) or stdin, dedupes, navigates
 * to each, extracts metrics from the hydration JSON (videos) or the
 * DOM (photos / slideshows), and POSTs the result to /api/sync/ingest
 * — same payload shape as the daily scraper.
 *
 * Usage:
 *   npx tsx refresh-by-url.ts urls.txt
 *   cat urls.txt | npx tsx refresh-by-url.ts
 *
 * URL formats accepted:
 *   https://www.tiktok.com/@user/video/<id>
 *   https://www.tiktok.com/@user/photo/<id>
 *   (with or without trailing query string)
 */

import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import * as fs from "fs";
import * as path from "path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);

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
const WS_FILE = path.join(SCRIPT_DIR, ".browser-ws");
const CDP_FILE = path.join(SCRIPT_DIR, ".browser-cdp");
const PROFILE_DIR = path.join(SCRIPT_DIR, "browser-profile");

interface ParsedUrl {
  username: string;
  type: "video" | "photo";
  postId: string;
  url: string;
}

interface ScrapedPost {
  postId: string;
  title: string;
  description: string;
  contentUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  postType: string;
  metrics: { views: number; likes: number; comments: number; shares: number };
}

function parseUrl(u: string): ParsedUrl | null {
  const m = u.match(/tiktok\.com\/@([^/]+)\/(video|photo)\/(\d+)/);
  if (!m) return null;
  return {
    username: m[1],
    type: m[2] as "video" | "photo",
    postId: m[3],
    url: `https://www.tiktok.com/@${m[1]}/${m[2]}/${m[3]}`,
  };
}

function dateFromSnowflakeId(id: string): string {
  try {
    const ts = Number(BigInt(id) >> 32n);
    if (ts > 1600000000 && ts < 2000000000) {
      return new Date(ts * 1000).toISOString();
    }
  } catch {}
  return new Date().toISOString();
}

function parseCount(text: string | null | undefined): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9.KMBkmb]/g, "");
  const m = cleaned.match(/([\d.]+)\s*([KMBkmb])?/);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const suf = (m[2] || "").toUpperCase();
  if (suf === "K") return Math.round(num * 1000);
  if (suf === "M") return Math.round(num * 1000000);
  if (suf === "B") return Math.round(num * 1000000000);
  return Math.round(num);
}

async function getBrowser(): Promise<{ browser: Browser | null; context: BrowserContext; standalone: boolean }> {
  const cdpFile = fs.existsSync(CDP_FILE) ? CDP_FILE : fs.existsSync(WS_FILE) ? WS_FILE : null;
  if (cdpFile) {
    const endpoint = fs.readFileSync(cdpFile, "utf-8").trim();
    try {
      const browser = await chromium.connectOverCDP(endpoint);
      const contexts = browser.contexts();
      const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
      console.log("[Refresh] Connected to running browser.");
      return { browser, context, standalone: false };
    } catch {
      console.log("[Refresh] Browser-server unreachable, launching standalone...");
    }
  } else {
    console.log("[Refresh] No browser-server found, launching standalone...");
  }

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
  return { browser: null, context, standalone: true };
}

async function extractVideo(page: Page, postUrl: string, postId: string): Promise<ScrapedPost | null> {
  const data = await page.evaluate(() => {
    const el = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
    if (!el || !el.textContent) return null;
    const json = JSON.parse(el.textContent);
    const scope = json["__DEFAULT_SCOPE__"];
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
  if (!data || !data.stats) return null;
  const createTime = Number(data.createTime || 0);
  return {
    postId: data.id || postId,
    title: String(data.desc || "").slice(0, 200),
    description: String(data.desc || ""),
    contentUrl: postUrl,
    thumbnailUrl: data.cover ?? null,
    publishedAt:
      createTime > 0
        ? new Date(createTime * 1000).toISOString()
        : dateFromSnowflakeId(data.id || postId),
    postType: "video",
    metrics: {
      views: Number(data.stats.playCount || 0),
      likes: Number(data.stats.diggCount || 0),
      comments: Number(data.stats.commentCount || 0),
      shares: Number(data.stats.shareCount || 0),
    },
  };
}

async function extractPhoto(page: Page, postUrl: string, postId: string): Promise<ScrapedPost | null> {
  try {
    await page.waitForSelector(
      '[data-e2e="like-count"], [data-e2e="browse-like-count"]',
      { timeout: 8000 }
    );
  } catch {
    // selector never appeared
  }
  const raw = await page.evaluate(() => {
    const descEl = document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]');
    const likesEl = document.querySelector('[data-e2e="like-count"], [data-e2e="browse-like-count"]');
    const commentsEl = document.querySelector('[data-e2e="comment-count"], [data-e2e="browse-comment-count"]');
    const sharesEl = document.querySelector('[data-e2e="share-count"], [data-e2e="browse-share-count"]');
    let thumbnail: string | null = null;
    const imgs = document.querySelectorAll("img");
    for (let i = 0; i < imgs.length; i++) {
      const src = imgs[i].getAttribute("src") || "";
      if (src.includes("tiktokcdn") && src.includes("photomode")) {
        thumbnail = src;
        break;
      }
    }
    return {
      desc: descEl?.textContent || "",
      likes: likesEl?.textContent || "",
      comments: commentsEl?.textContent || "",
      shares: sharesEl?.textContent || "",
      thumbnail,
    };
  });
  const likes = parseCount(raw.likes);
  const comments = parseCount(raw.comments);
  const shares = parseCount(raw.shares);
  if (likes === 0 && comments === 0 && shares === 0 && !raw.thumbnail) return null;
  return {
    postId,
    title: raw.desc.slice(0, 200),
    description: raw.desc.slice(0, 500),
    contentUrl: postUrl,
    thumbnailUrl: raw.thumbnail,
    publishedAt: dateFromSnowflakeId(postId),
    postType: "slideshow",
    metrics: { views: 0, likes, comments, shares },
  };
}

async function pushBatch(username: string, posts: ScrapedPost[]): Promise<void> {
  if (posts.length === 0) return;
  const res = await fetch(`${API_URL}/api/sync/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_TOKEN}` },
    body: JSON.stringify({ platform: "tiktok", accountId: username, posts }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API ${res.status} for @${username}: ${text.slice(0, 300)}`);
  }
  console.log(`[Refresh]   pushed ${posts.length} post(s) for @${username}: ${text.slice(0, 200)}`);
}

async function readUrls(): Promise<string[]> {
  const arg = process.argv[2];
  if (arg && fs.existsSync(arg)) {
    return fs.readFileSync(arg, "utf-8").split("\n").map((s) => s.trim()).filter(Boolean);
  }
  // stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8").split("\n").map((s) => s.trim()).filter(Boolean);
}

async function main() {
  if (!API_TOKEN) {
    console.error("[Refresh] API_TOKEN not set in .env — aborting.");
    process.exit(1);
  }

  const rawUrls = await readUrls();
  const seen = new Set<string>();
  const targets: ParsedUrl[] = [];
  for (const u of rawUrls) {
    const p = parseUrl(u);
    if (!p) {
      console.log(`[Refresh] skip (couldn't parse): ${u}`);
      continue;
    }
    if (seen.has(p.postId)) continue;
    seen.add(p.postId);
    targets.push(p);
  }
  if (targets.length === 0) {
    console.error("[Refresh] No valid URLs to process.");
    process.exit(1);
  }

  console.log(`[Refresh] Refreshing ${targets.length} TikTok posts...`);

  const { browser, context, standalone } = await getBrowser();
  // Bucket scraped posts per username so each API push targets the
  // right SocialAccount.
  const byUser = new Map<string, ScrapedPost[]>();
  let ok = 0;
  let failed = 0;

  try {
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        await page.goto(t.url, { waitUntil: "domcontentloaded", timeout: 25000 });
        await page.waitForTimeout(2000 + Math.random() * 1000);
        const post = t.type === "photo"
          ? await extractPhoto(page, t.url, t.postId)
          : await extractVideo(page, t.url, t.postId);
        if (post) {
          if (!byUser.has(t.username)) byUser.set(t.username, []);
          byUser.get(t.username)!.push(post);
          ok++;
          console.log(
            `[Refresh] [${i + 1}/${targets.length}] @${t.username} ${t.type}/${t.postId} → views=${post.metrics.views} likes=${post.metrics.likes}`
          );
        } else {
          failed++;
          console.log(`[Refresh] [${i + 1}/${targets.length}] @${t.username} ${t.type}/${t.postId} → no data`);
        }
      } catch (err) {
        failed++;
        console.log(
          `[Refresh] [${i + 1}/${targets.length}] @${t.username} ${t.type}/${t.postId} → error: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    // Push each user's batch to the ingest endpoint.
    for (const [username, posts] of byUser.entries()) {
      try {
        await pushBatch(username, posts);
      } catch (err) {
        console.error(`[Refresh] push failed for @${username}: ${err}`);
      }
    }

    await page.goto("about:blank").catch(() => {});
  } finally {
    if (standalone) await context.close();
    else if (browser) await browser.close();
  }

  console.log(`[Refresh] Done. Scraped: ${ok}, failed: ${failed}, accounts: ${byUser.size}`);
  if (failed > 0) process.exit(2);
}

main().catch((err) => {
  console.error("[Refresh] Fatal:", err);
  process.exit(1);
});
