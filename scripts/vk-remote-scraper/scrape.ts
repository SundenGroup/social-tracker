/**
 * VK Remote Scraper — runs from a residential-IP machine (Simon's Mac).
 *
 * Pipeline per VK group:
 *   1. Playwright loads vk.com/<short_name>, waits for posts to render.
 *   2. For each post card in the DOM:
 *        - Extracts post ID, text, publish date
 *        - Extracts wall-level likes / comments / reposts from the counters
 *        - Regex-matches any `video-<oid>_<id>` reference in the raw HTML
 *          and keeps the first one (VK's primary video attachment)
 *   3. For each unique video ID, hits `vk.com/video_ext.php` (unauth,
 *      works anywhere) to pull the video view count + video-level likes.
 *   4. POSTs everything to /api/sync/ingest — one SocialAccount per run.
 *
 * Followers / member count comes from the group's og:metadata.
 *
 * Env (see .env.example):
 *   API_URL, API_TOKEN, VK_ACCOUNTS, MAX_POSTS_PER_RUN, HEADLESS
 *
 * Usage:
 *   npm install && npx playwright install chromium
 *   cp .env.example .env && (fill in values)
 *   npm run scrape
 */
import { chromium, type Browser, type Page } from "playwright";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// ───────── env loader (no extra dep) ─────────
const envPath = join(SCRIPT_DIR, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const API_URL = process.env.API_URL ?? "https://social.clutch.game";
const API_TOKEN = process.env.API_TOKEN ?? "";
const VK_ACCOUNTS = (process.env.VK_ACCOUNTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_POSTS = Number(process.env.MAX_POSTS_PER_RUN ?? 30);
// Visible browser by default — matches the Instagram + TikTok scrapers.
// A real rendered browser is less likely to trip VK's anti-bot heuristics
// than a headless one, and on first run you want to see what VK serves.
// Override with HEADLESS=true in .env once you have cron running.
const HEADLESS = (process.env.HEADLESS ?? "false").toLowerCase() === "true";

if (!API_TOKEN) {
  console.error("[VK] Missing API_TOKEN — aborting. See .env.example.");
  process.exit(1);
}
if (VK_ACCOUNTS.length === 0) {
  console.error("[VK] Missing VK_ACCOUNTS — aborting. See .env.example.");
  process.exit(1);
}

// ───────── types ─────────
interface ScrapedPost {
  postId: string;
  title?: string;
  description: string;
  contentUrl: string;
  thumbnailUrl?: string;
  publishedAt: string;
  postType: "video" | "text";
  attachedVideoId?: string; // "<oid>_<id>" format
  metrics: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
}

interface ScrapeResult {
  posts: ScrapedPost[];
  followers: number;
  groupNumericId?: string;
}

// ───────── main scrape ─────────
async function scrapeAccount(browser: Browser, shortName: string): Promise<ScrapeResult> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  const page = await context.newPage();

  try {
    const url = `https://vk.com/${shortName}`;
    console.log(`[VK:${shortName}] Loading ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    // VK renders posts via JS after a short tick — wait for the post-stream
    // container or bail after 12s with whatever we've got.
    await page
      .waitForSelector('[data-testid="posts_feed"], .post, [id^="post"]', { timeout: 12000 })
      .catch(() => null);
    await page.waitForTimeout(2500);

    // Gently scroll to load more posts (VK lazy-loads as you scroll).
    for (let i = 0; i < 4; i++) {
      await page.evaluate("window.scrollBy(0, window.innerHeight * 1.5)");
      await page.waitForTimeout(900);
    }
    await page.evaluate("window.scrollTo(0, 0)");
    await page.waitForTimeout(500);

    // Extract group numeric id + follower count from the page data
    const groupMeta = await page.evaluate(() => {
      // Owner id is embedded in post IDs and in VK's data attributes. Pull
      // the first one we can find.
      const postEl = document.querySelector('[id^="post-"], [id^="post"]');
      const postIdAttr = postEl?.id ?? "";
      const m = postIdAttr.match(/post(-?\d+)_\d+/);
      const oid = m?.[1] ?? "";

      // Followers — VK renders the count as text next to "подписчиков" or
      // "subscribers". Crude but stable across themes.
      const txt = document.body.innerText;
      const f =
        txt.match(/([\d\s,]+)\s*(?:subscribers|подписч)/i)?.[1] ??
        txt.match(/Followers[^0-9]*([\d\s,]+)/i)?.[1] ??
        "";
      const followers = Number(f.replace(/[\s,]/g, "")) || 0;

      return { oid, followers };
    });

    console.log(
      `[VK:${shortName}] groupId=${groupMeta.oid}, followers=${groupMeta.followers}, scraping posts...`
    );

    // Pull posts out of the DOM. Each post card is an element whose id
    // starts with "post"; the structure is `post<oid>_<local_id>`.
    const rawPosts = await page.evaluate((max: number) => {
      const out: Array<{
        oid: string;
        localId: string;
        text: string;
        permalink: string;
        thumb: string | null;
        date: string | null;
        likes: number | null;
        comments: number | null;
        reposts: number | null;
        innerHtml: string;
      }> = [];

      const nodes = document.querySelectorAll('[id^="post-"], [id^="post"]');
      const seen = new Set<string>();
      for (const node of Array.from(nodes)) {
        if (out.length >= max) break;
        const id = (node as HTMLElement).id;
        const m = id.match(/post(-?\d+)_(\d+)/);
        if (!m) continue;
        if (seen.has(id)) continue;
        seen.add(id);

        const textEl = node.querySelector(
          '[data-testid="wall_post_text"], .wall_post_text, .PostContent__text'
        );
        const text = (textEl as HTMLElement)?.innerText ?? "";

        // Permalink — the datetime element typically has a link to the post
        const permaEl = node.querySelector('a[href*="wall"]');
        const permalink = (permaEl as HTMLAnchorElement)?.href ?? "";

        // Thumbnail — pick the first <img> inside the post that isn't an avatar
        const imgs = Array.from(node.querySelectorAll("img")) as HTMLImageElement[];
        const thumb =
          imgs.find((i) => !i.src.includes("/photos_bytes/") && i.naturalWidth > 80)?.src ?? null;

        // Counters — VK exposes these as aria-labels or data attributes on
        // the reaction/comment/share buttons. Keep selectors liberal.
        const numberFrom = (sel: string) => {
          const el = node.querySelector(sel) as HTMLElement | null;
          if (!el) return null;
          const label = el.getAttribute("aria-label") || el.textContent || "";
          const n = label.match(/([\d\s,.]+[KMBkmb]?)/)?.[1];
          if (!n) return null;
          const raw = n.replace(/[\s,]/g, "");
          const suffix = raw.slice(-1).toUpperCase();
          const base = parseFloat(raw);
          if (isNaN(base)) return null;
          if (suffix === "K") return Math.round(base * 1000);
          if (suffix === "M") return Math.round(base * 1_000_000);
          if (suffix === "B") return Math.round(base * 1_000_000_000);
          return Math.round(base);
        };

        // Date — VK shows relative time or an absolute timestamp in the
        // header. Try the <time> element first.
        const timeEl = node.querySelector("time");
        const date =
          timeEl?.getAttribute("datetime") ??
          timeEl?.getAttribute("title") ??
          (permaEl as HTMLElement)?.getAttribute("title") ??
          null;

        out.push({
          oid: m[1],
          localId: m[2],
          text,
          permalink,
          thumb,
          date,
          likes: numberFrom('[class*="like"], [aria-label*="like" i]'),
          comments: numberFrom('[class*="comment"], [aria-label*="comment" i]'),
          reposts: numberFrom('[class*="repost"], [class*="share"], [aria-label*="share" i]'),
          innerHtml: node.innerHTML,
        });
      }
      return out;
    }, MAX_POSTS);

    console.log(`[VK:${shortName}] Found ${rawPosts.length} posts on the wall`);

    const posts: ScrapedPost[] = rawPosts.map((p) => {
      // Look for video-<oid>_<id> in the post's raw HTML
      const vm = p.innerHtml.match(/video(-?\d+)_(\d+)/);
      const attachedVideoId = vm ? `${vm[1]}_${vm[2]}` : undefined;

      return {
        postId: p.localId,
        description: p.text.slice(0, 10_000),
        title: p.text.slice(0, 200),
        contentUrl: p.permalink || `https://vk.com/wall${p.oid}_${p.localId}`,
        thumbnailUrl: p.thumb ?? undefined,
        publishedAt: p.date && !isNaN(Date.parse(p.date))
          ? new Date(p.date).toISOString()
          : new Date().toISOString(),
        postType: attachedVideoId ? "video" : "text",
        attachedVideoId,
        metrics: {
          likes: p.likes ?? 0,
          comments: p.comments ?? 0,
          shares: p.reposts ?? 0,
        },
      };
    });

    // Enrich posts that have an attached video with view counts from video_ext.php
    const uniqueVideoIds = Array.from(
      new Set(posts.map((p) => p.attachedVideoId).filter(Boolean) as string[])
    );
    console.log(`[VK:${shortName}] Fetching video_ext.php for ${uniqueVideoIds.length} videos...`);

    const videoViews: Record<string, number> = {};
    for (const vid of uniqueVideoIds) {
      const m = vid.match(/^(-?\d+)_(\d+)$/);
      if (!m) continue;
      try {
        const r = await fetch(`https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}`, {
          headers: {
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(15_000),
        });
        const body = await r.text();
        const vm = body.match(/"views":(\d+)/);
        if (vm) videoViews[vid] = Number(vm[1]);
      } catch (err) {
        console.warn(`[VK:${shortName}] video_ext ${vid} failed: ${err}`);
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    // Merge video views onto matching posts
    for (const post of posts) {
      if (post.attachedVideoId && videoViews[post.attachedVideoId] != null) {
        post.metrics.views = videoViews[post.attachedVideoId];
      }
    }

    return {
      posts,
      followers: groupMeta.followers,
      groupNumericId: groupMeta.oid,
    };
  } finally {
    try {
      await page.close();
    } catch { /* already closed */ }
    try {
      await context.close();
    } catch { /* already closed */ }
  }
}

async function pushToIngest(accountId: string, result: ScrapeResult): Promise<void> {
  const body = {
    platform: "vk" as const,
    accountId,
    posts: result.posts,
    stats: { followers: result.followers },
  };
  console.log(
    `[VK:${accountId}] POSTing ${result.posts.length} posts + followers=${result.followers} → ingest...`
  );
  const res = await fetch(`${API_URL}/api/sync/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Ingest failed ${res.status}: ${text.slice(0, 500)}`);
  }
  console.log(`[VK:${accountId}] Ingest OK: ${text.slice(0, 200)}`);
}

async function main() {
  console.log(`[VK] Starting scrape for ${VK_ACCOUNTS.length} account(s)...`);
  const browser = await chromium.launch({ headless: HEADLESS });
  try {
    for (const shortName of VK_ACCOUNTS) {
      try {
        const result = await scrapeAccount(browser, shortName);
        if (result.posts.length === 0) {
          console.warn(`[VK:${shortName}] No posts extracted; skipping ingest`);
          continue;
        }
        await pushToIngest(shortName, result);
      } catch (err) {
        console.error(`[VK:${shortName}] Failed:`, err);
      }
    }
  } finally {
    await browser.close();
  }
  console.log("[VK] Done.");
}

main().catch((err) => {
  console.error("[VK] Fatal:", err);
  process.exit(1);
});
