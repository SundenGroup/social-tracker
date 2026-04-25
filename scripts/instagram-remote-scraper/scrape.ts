#!/usr/bin/env npx tsx
/**
 * Instagram Remote Scraper
 *
 * Connects to a Chrome browser that's already running (started by browser-server.ts).
 * The browser stays open between runs — mimics a real user browsing Instagram.
 *
 * Flow:
 *   1. Connect to running Chrome via WebSocket
 *   2. Load profile page, scroll to collect post links
 *   3. Visit each post page to get full details (caption, date, metrics)
 *   4. Push results to the Clutch Social Tracker API
 *
 * Usage:
 *   First start the browser:  npx tsx browser-server.ts
 *   Then run scraper:         npx tsx scrape.ts
 *
 * Schedule the scraper via launchd or cron for daily runs.
 * The browser-server should be started once and left running.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { EXTRACT_POST_PAGE_JS, type PostPageExtraction } from "./extract-post-page";

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
const INSTAGRAM_USERNAMES: string[] = (process.env.INSTAGRAM_USERNAMES || "pubgesports")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);
const MAX_POSTS = parseInt(process.env.MAX_POSTS || "50", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "3", 10);
const RETRY_DELAY_MIN = parseInt(process.env.RETRY_DELAY_MIN || "5", 10);
// Persist progress to `checkpoint-<user>.json` every N successfully-scraped
// posts so a crash/Ctrl+C doesn't lose everything. Cheap; always on.
const CHECKPOINT_EVERY = parseInt(process.env.CHECKPOINT_EVERY || "25", 10);
// If > 0, push to the API incrementally every N posts (in addition to the
// final push). Lets long runs get partial data into the dashboard before the
// scrape finishes, and bounds the data-loss window if the run is abandoned.
// Default 0 = only the single push at the end (existing behavior).
const PUSH_EVERY = parseInt(process.env.PUSH_EVERY || "0", 10);
// Checkpoints older than this are discarded (user left it sitting for days).
const CHECKPOINT_TTL_MS = 7 * 24 * 3600_000;

const CDP_FILE = path.join(SCRIPT_DIR, ".browser-cdp");
const PROFILE_DIR = path.join(SCRIPT_DIR, "browser-profile");
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

interface ScrapedPost {
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

interface ProfileStats {
  followers: number;
  following: number;
  videoCount: number;
}

/**
 * Convert Instagram shortcode to numeric media ID.
 */
function shortcodeToMediaId(code: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = BigInt(0);
  for (const char of code) {
    id = id * 64n + BigInt(alphabet.indexOf(char));
  }
  return id.toString();
}

/**
 * Connect to the running browser, or launch one if browser-server isn't running.
 */
async function getBrowser(): Promise<{
  browser: Browser | null;
  context: BrowserContext;
  standalone: boolean;
}> {
  if (fs.existsSync(CDP_FILE)) {
    const endpoint = fs.readFileSync(CDP_FILE, "utf-8").trim();
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
 * Parse Instagram shortcode from a post URL.
 */
function extractShortcode(href: string): string | null {
  // Matches /p/SHORTCODE/, /reel/SHORTCODE/, /tv/SHORTCODE/
  const m = href.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[2] : null;
}

/**
 * Determine post type from URL pattern.
 */
function getPostType(href: string): string {
  if (href.includes("/reel/")) return "video";
  if (href.includes("/tv/")) return "video";
  return "image"; // /p/ can be image or carousel, we'll refine in post detail
}

/**
 * Parse compact number strings like "1.2M", "45.3K", "892"
 */
function parseCompactNumber(text: string | null | undefined): number {
  if (!text) return 0;
  const cleaned = text.replace(/[,\s]/g, "").trim();
  const m = cleaned.match(/([\d.]+)\s*([KMBkmb])?/);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const suffix = (m[2] || "").toUpperCase();
  if (suffix === "K") return Math.round(num * 1000);
  if (suffix === "M") return Math.round(num * 1000000);
  if (suffix === "B") return Math.round(num * 1000000000);
  return Math.round(num);
}

/**
 * Wait for and detect login wall / challenge page.
 */
async function checkForLoginWall(page: Page): Promise<boolean> {
  return page.evaluate(`
    (() => {
      const text = document.body?.innerText || "";
      return (
        text.includes("Log in to Instagram") ||
        (text.includes("Log In") && document.querySelector('input[name="username"]') !== null) ||
        text.includes("Sorry, this page isn't available")
      );
    })()
  `);
}

interface ScrapeResult {
  posts: ScrapedPost[];
  profileStats: ProfileStats | null;
  /** True when we bailed early (Ctrl+C / SIGTERM). Main keeps the
   *  checkpoint around so the next run can resume. */
  interrupted?: boolean;
}

// ───────── checkpoint + signal handling ─────────

interface PostLink {
  shortcode: string;
  href: string;
  type: string;
}

interface Checkpoint {
  version: 1;
  username: string;
  startedAt: string;
  updatedAt: string;
  profileStats: ProfileStats | null;
  targetLinks: PostLink[];      // full list discovered during scrolling
  scrapedPosts: ScrapedPost[];  // posts with full details (may include pushed ones)
  pushedUpTo: number;           // how many of scrapedPosts have been ingested
}

function checkpointPath(username: string): string {
  return path.join(SCRIPT_DIR, `checkpoint-${username}.json`);
}

function loadCheckpoint(username: string): Checkpoint | null {
  try {
    const raw = fs.readFileSync(checkpointPath(username), "utf-8");
    const cp = JSON.parse(raw) as Checkpoint;
    if (cp.version !== 1 || cp.username !== username) return null;
    const age = Date.now() - new Date(cp.updatedAt).getTime();
    if (age > CHECKPOINT_TTL_MS) {
      console.log(`[Scraper] Checkpoint for @${username} is ${Math.round(age / 3600_000)}h old — discarding, starting fresh.`);
      return null;
    }
    return cp;
  } catch {
    return null;
  }
}

function saveCheckpoint(cp: Checkpoint) {
  cp.updatedAt = new Date().toISOString();
  // Atomic write — write to temp then rename, so a crash mid-write
  // doesn't corrupt the file.
  const p = checkpointPath(cp.username);
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cp));
  fs.renameSync(tmp, p);
}

function clearCheckpoint(username: string) {
  try { fs.unlinkSync(checkpointPath(username)); } catch { /* ignore */ }
}

// SIGINT/SIGTERM flag shared by scrape(). We only break out of the per-post
// loop — still give the current post a chance to finish so the checkpoint
// reflects a clean boundary.
let interrupted = false;
let sigintCount = 0;
process.on("SIGINT", () => {
  sigintCount++;
  if (sigintCount > 1) {
    console.log("\n[Scraper] Forced exit.");
    process.exit(130);
  }
  interrupted = true;
  console.log("\n[Scraper] Interrupt received — finishing current post, saving checkpoint, pushing progress, then exiting...");
});
process.on("SIGTERM", () => { interrupted = true; });

/**
 * Scrape a single Instagram account.
 */
async function scrape(username: string): Promise<ScrapeResult> {
  const { browser, context, standalone } = await getBrowser();
  const interactive = SETUP_MODE;

  if (interactive) {
    console.log("[Scraper] INTERACTIVE MODE — script will pause so you can interact with the browser.");
  }

  // --- Step 0: Check for a checkpoint from a prior interrupted run ---
  // If found and fresh, we skip the scroll phase (expensive) and resume
  // per-post scraping from where we left off.
  const resumeFrom = loadCheckpoint(username);
  if (resumeFrom) {
    const done = resumeFrom.scrapedPosts.length;
    const total = resumeFrom.targetShortcodes.length;
    console.log(`[Scraper] Found checkpoint for @${username}: ${done}/${total} posts already scraped (${resumeFrom.pushedUpTo} pushed). Resuming...`);
  }

  try {
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // --- Step 1: Warm up on Instagram homepage ---
    console.log("[Scraper] Warming up on Instagram homepage...");
    await page.goto("https://www.instagram.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (interactive) {
      await waitForEnter("Homepage loaded. Log in if needed, accept cookies, etc.");
    } else {
      await page.waitForTimeout(3000 + Math.random() * 2000);
    }

    // --- Step 2: Load profile page ---
    console.log(`[Scraper] Loading @${username} profile...`);
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (interactive) {
      await waitForEnter("Profile loaded. Make sure you see the post grid.");
    } else {
      await page.waitForTimeout(4000 + Math.random() * 2000);
    }

    // Check for login wall
    const blocked = await checkForLoginWall(page);
    if (blocked) {
      await page.screenshot({ path: path.join(SCRIPT_DIR, `debug-screenshot-${username}.png`) });
      throw new Error(
        "Login wall detected — Instagram requires login to view this profile. " +
        "Try running with --setup to log in manually first."
      );
    }

    // --- Step 3: Extract profile stats ---
    let profileStats: ProfileStats | null = null;
    try {
      profileStats = await page.evaluate(`
        (() => {
          const pc = (s) => {
            const cleaned = s.replace(/[,\\s]/g, "");
            const m = cleaned.match(/([\\d.]+)([KMBkmb])?/);
            if (!m) return 0;
            const num = parseFloat(m[1]);
            const suf = (m[2] || "").toUpperCase();
            if (suf === "K") return Math.round(num * 1000);
            if (suf === "M") return Math.round(num * 1000000);
            if (suf === "B") return Math.round(num * 1000000000);
            return Math.round(num);
          };

          const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
          const metaMatch = metaDesc.match(
            /([\\d,.KMBkmb]+)\\s*Followers?,?\\s*([\\d,.KMBkmb]+)\\s*Following,?\\s*([\\d,.KMBkmb]+)\\s*Posts?/i
          );
          if (metaMatch) {
            return {
              followers: pc(metaMatch[1]),
              following: pc(metaMatch[2]),
              videoCount: pc(metaMatch[3]),
            };
          }

          const statElements = document.querySelectorAll("header li span, header ul li span");
          const stats = [];
          statElements.forEach((el) => {
            const title = el.getAttribute("title");
            const text = title || el.textContent || "";
            const cleaned = text.replace(/[,\\s]/g, "");
            const num = parseInt(cleaned, 10);
            if (!isNaN(num) && num >= 0) stats.push(num);
          });
          if (stats.length >= 3) {
            return { followers: stats[1], following: stats[2], videoCount: stats[0] };
          }

          return null;
        })()
      `);

      if (profileStats) {
        console.log(
          `[Scraper] Profile stats: ${profileStats.followers} followers, ${profileStats.videoCount} posts`
        );
      } else {
        console.log("[Scraper] Could not extract profile stats from page");
      }
    } catch {
      console.log("[Scraper] Error extracting profile stats");
    }

    // --- Step 4: Scroll to load posts and collect post links ---
    // Scrape both the main Posts tab and the Reels tab to get all content.
    // Instagram uses virtual scrolling — it removes off-screen elements from
    // the DOM. We must collect links DURING scrolling, not just at the end.
    //
    // If we're resuming from a checkpoint, skip this whole phase and reuse
    // the previously-collected link list.
    const allPostLinks = new Map<string, PostLink>();

    if (resumeFrom) {
      for (const link of resumeFrom.targetLinks) allPostLinks.set(link.shortcode, link);
      // Also reuse the profile stats we captured before (cheap, no re-fetch).
      if (resumeFrom.profileStats) profileStats = resumeFrom.profileStats;
      console.log(`[Scraper] Resume mode — skipping scroll phase, using ${allPostLinks.size} saved post links.`);
    } else {

    const collectLinksFromPage = async () => {
      const links: PostLink[] = await page.$$eval(
        'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
        (els) => {
          const result: PostLink[] = [];
          els.forEach((e) => {
            const href = e.getAttribute("href") || "";
            const m = href.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
            if (m) {
              result.push({
                shortcode: m[2],
                href: href.startsWith("http") ? href : `https://www.instagram.com${href}`,
                type: m[1] === "reel" || m[1] === "tv" ? "video" : "image",
              });
            }
          });
          return result;
        }
      );
      for (const link of links) {
        if (!allPostLinks.has(link.shortcode)) {
          allPostLinks.set(link.shortcode, link);
        }
      }
    };

    const scrapeTabs = [
      { url: `https://www.instagram.com/${username}/`, label: "Posts" },
      { url: `https://www.instagram.com/${username}/reels/`, label: "Reels" },
    ];

    for (const tab of scrapeTabs) {
      if (interrupted) break;
      if (tab.label === "Reels") {
        console.log(`[Scraper] Loading ${tab.label} tab...`);
        await page.goto(tab.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(3000 + Math.random() * 2000);
      }

      // Collect links before scrolling (captures top-of-page posts)
      await collectLinksFromPage();

      console.log(`[Scraper] Scrolling ${tab.label} tab to load posts...`);
      let prevTotalCount = allPostLinks.size;
      let staleScrolls = 0;

      // Iteration cap scales with MAX_POSTS — at ~10 new posts per scroll
      // we need roughly MAX_POSTS/10 scrolls, plus headroom for IG's lazy
      // loader pausing between virtual-scroll chunks. Hard ceiling of 2000
      // prevents runaway loops if IG starts serving the same page forever.
      const maxScrolls = Math.min(2000, Math.max(30, Math.ceil(MAX_POSTS / 5)));
      // Be more patient with stale scrolls when the user asked for a lot
      // of posts — IG throttles lazy-load after the first few hundred.
      const staleLimit = MAX_POSTS > 500 ? 15 : 5;

      for (let i = 0; i < maxScrolls; i++) {
        if (interrupted) break;
        await page.evaluate("window.scrollBy(0, window.innerHeight * 2)");
        await page.waitForTimeout(1500 + Math.random() * 1500);

        // Collect links after each scroll (before they get virtualized away)
        await collectLinksFromPage();

        if (allPostLinks.size >= MAX_POSTS) break;
        if (allPostLinks.size === prevTotalCount) {
          staleScrolls++;
          // Nudge: scroll up a bit, then back down — sometimes wakes up
          // IG's virtual scroller when it goes quiet.
          if (staleScrolls === Math.floor(staleLimit / 2)) {
            await page.evaluate("window.scrollBy(0, -window.innerHeight)");
            await page.waitForTimeout(800);
            await page.evaluate("window.scrollBy(0, window.innerHeight * 3)");
            await page.waitForTimeout(2000);
            await collectLinksFromPage();
          }
          if (staleScrolls >= staleLimit) break;
        } else {
          staleScrolls = 0;
          if (i % 10 === 0) {
            console.log(`[Scraper] ... scroll ${i}: ${allPostLinks.size} posts collected (${tab.label})`);
          }
        }
        prevTotalCount = allPostLinks.size;
      }

      console.log(`[Scraper] ${allPostLinks.size} total unique posts after ${tab.label} tab`);
    }

    } // end of non-resume (scroll) branch

    const postLinks = Array.from(allPostLinks.values());
    console.log(`[Scraper] Found ${postLinks.length} unique post links total`);

    if (postLinks.length === 0) {
      await page.screenshot({ path: path.join(SCRIPT_DIR, `debug-screenshot-${username}.png`) });
      throw new Error("No posts found on profile (login wall or page load issue)");
    }

    // Limit to MAX_POSTS
    const toScrape = postLinks.slice(0, MAX_POSTS);

    // Initialize / hydrate state from checkpoint so we don't re-scrape posts.
    const posts: ScrapedPost[] = resumeFrom?.scrapedPosts.slice() ?? [];
    const alreadyScraped = new Set(posts.map((p) => p.postId));
    let pushedUpTo = resumeFrom?.pushedUpTo ?? 0;
    const remaining = toScrape.filter((l) => !alreadyScraped.has(l.shortcode));

    // Seed the checkpoint so a crash during the per-post loop still leaves
    // something resumable (even before the first CHECKPOINT_EVERY threshold).
    const startedAt = resumeFrom?.startedAt ?? new Date().toISOString();
    let checkpoint: Checkpoint = {
      version: 1,
      username,
      startedAt,
      updatedAt: new Date().toISOString(),
      profileStats,
      targetLinks: toScrape,
      scrapedPosts: posts,
      pushedUpTo,
    };
    saveCheckpoint(checkpoint);

    // --- Step 5: Visit each post page to get full details ---
    console.log(
      `[Scraper] Scraping details for ${remaining.length} posts (${posts.length} already done from checkpoint)...`
    );
    let failures = 0;

    // Navigate to Instagram homepage first to ensure cookies are active for API calls
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    for (let i = 0; i < remaining.length; i++) {
      if (interrupted) {
        console.log(`[Scraper] Interrupted after ${posts.length}/${toScrape.length} posts. Checkpoint saved.`);
        break;
      }
      const { shortcode, href, type } = remaining[i];

      try {
        const mediaId = shortcodeToMediaId(shortcode);

        // Fetch post details via Instagram's private API (much more reliable than scraping)
        const apiResult = await page.evaluate(`
          fetch("https://www.instagram.com/api/v1/media/${mediaId}/info/", {
            headers: {
              "X-IG-App-ID": "936619743392459",
              "X-Requested-With": "XMLHttpRequest",
            },
            credentials: "include",
          })
          .then(r => r.json())
          .then(json => {
            const item = json.items?.[0];
            if (!item) return { ok: false, error: "no items" };

            return {
              ok: true,
              play_count: item.play_count || item.video_view_count || 0,
              like_count: item.like_count || 0,
              comment_count: item.comment_count || 0,
              share_count: item.share_count || item.reshare_count || 0,
              media_type: item.media_type || 0,
              taken_at: item.taken_at || 0,
              caption: item.caption?.text || "",
              thumbnailUrl: item.image_versions2?.candidates?.[0]?.url || null,
            };
          })
          .catch(err => ({ ok: false, error: err.message }))
        `);

        if (!apiResult.ok) {
          // Private API blocked (IG rate-limit). Fall back to visiting
          // the post page and using the shared extractor — pulls caption
          // from og:title (since IG dropped JSON-LD on logged-out
          // sessions) and views from inline GraphQL JSON via regex.
          await page.goto(href, { waitUntil: "domcontentloaded", timeout: 20000 });
          await page.waitForTimeout(2500 + Math.random() * 1000);

          const fallbackData = (await page.evaluate(EXTRACT_POST_PAGE_JS)) as PostPageExtraction;

          const fbPostType = fallbackData.isVideo
            ? "video"
            : (type === "video" ? "video" : "image");

          posts.push({
            postId: shortcode,
            title: (fallbackData.caption || "").slice(0, 200),
            description: fallbackData.caption || "",
            contentUrl: href,
            thumbnailUrl: fallbackData.thumbnailUrl,
            publishedAt: fallbackData.publishedAt || new Date().toISOString(),
            postType: fbPostType,
            metrics: {
              views: fallbackData.views,
              likes: fallbackData.likes,
              comments: fallbackData.comments,
              shares: 0,
            },
          });
        } else {
          // API succeeded — use the full data
          const views = apiResult.play_count || apiResult.video_view_count || 0;
          const likes = apiResult.like_count || 0;
          const commentCount = apiResult.comment_count || 0;
          const shares = apiResult.share_count || apiResult.reshare_count || 0;
          const takenAt = apiResult.taken_at || 0;
          const mediaType = apiResult.media_type || 0;
          const caption = apiResult.caption || "";

          let postType = type;
          if (mediaType === 2) postType = "video";
          else if (mediaType === 8) postType = "carousel";
          else if (mediaType === 1) postType = "image";

          posts.push({
            postId: shortcode,
            title: caption.slice(0, 200),
            description: caption,
            contentUrl: href,
            thumbnailUrl: apiResult.thumbnailUrl || null,
            publishedAt: takenAt > 0 ? new Date(takenAt * 1000).toISOString() : new Date().toISOString(),
            postType,
            metrics: {
              views,
              likes,
              comments: commentCount,
              shares,
            },
          });
        }

        if ((i + 1) % 10 === 0) {
          console.log(`[Scraper] ... ${posts.length}/${toScrape.length} posts scraped (this run: ${i + 1}/${remaining.length})`);
        }

        // Persist a checkpoint every CHECKPOINT_EVERY posts so a crash
        // / Ctrl+C doesn't lose the work we've done. Cheap — a few KB write.
        if (posts.length % CHECKPOINT_EVERY === 0) {
          checkpoint = { ...checkpoint, profileStats, scrapedPosts: posts, pushedUpTo };
          saveCheckpoint(checkpoint);
        }

        // Incremental push: if the user set PUSH_EVERY, stream completed
        // batches to the server so their dashboard fills in progressively.
        if (PUSH_EVERY > 0 && posts.length - pushedUpTo >= PUSH_EVERY) {
          try {
            const batch = posts.slice(pushedUpTo);
            console.log(`[Scraper] Incremental push: ${batch.length} posts...`);
            await pushToAPI(username, batch, profileStats);
            pushedUpTo = posts.length;
            checkpoint = { ...checkpoint, scrapedPosts: posts, pushedUpTo };
            saveCheckpoint(checkpoint);
          } catch (err) {
            console.log(`[Scraper] Incremental push failed (will retry at end): ${err instanceof Error ? err.message : err}`);
          }
        }

        // Small delay between API calls to avoid rate limiting
        if (i < remaining.length - 1) {
          await page.waitForTimeout(500 + Math.random() * 1000);
        }
      } catch (err) {
        failures++;
        console.log(`[Scraper] Failed to scrape ${shortcode}: ${err instanceof Error ? err.message : err}`);
        if (failures > 10) {
          console.log(`[Scraper] Too many failures (${failures}), stopping early`);
          break;
        }
      }
    }

    // Final checkpoint snapshot — covers the case where we finished cleanly
    // OR were interrupted.
    checkpoint = { ...checkpoint, profileStats, scrapedPosts: posts, pushedUpTo };
    saveCheckpoint(checkpoint);

    console.log(
      `[Scraper] Scraped ${posts.length}/${toScrape.length} posts (${failures} failures, ${interrupted ? "INTERRUPTED" : "complete"})`
    );

    if (posts.length === 0) {
      throw new Error("Failed to scrape any post details");
    }

    // Navigate away so browser isn't sitting on Instagram between runs
    await page.goto("about:blank").catch(() => {});

    return { posts, profileStats, interrupted };
  } finally {
    if (standalone) {
      await context.close();
    }
  }
}

/**
 * Push scraped posts to the production API.
 */
async function pushToAPI(
  username: string,
  posts: ScrapedPost[],
  profileStats?: ProfileStats | null
): Promise<void> {
  console.log(`[Scraper] Pushing ${posts.length} posts for @${username} to ${API_URL}...`);

  const payload: Record<string, unknown> = {
    platform: "instagram",
    accountId: username,
    posts,
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

  console.log(
    `[Scraper] Instagram scraper for ${INSTAGRAM_USERNAMES.length} account(s): ${INSTAGRAM_USERNAMES.map((u) => `@${u}`).join(", ")}`
  );
  console.log(`[Scraper] Target: ${API_URL}/api/sync/ingest`);
  console.log(`[Scraper] Max posts: ${MAX_POSTS} | Retries: ${MAX_RETRIES} | Delay: ${RETRY_DELAY_MIN}min`);

  let hasFailure = false;

  for (const username of INSTAGRAM_USERNAMES) {
    console.log(`\n[Scraper] ========== @${username} ==========`);

    let success = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[Scraper] === Attempt ${attempt}/${MAX_RETRIES} for @${username} ===`);
        const { posts, profileStats, interrupted: wasInterrupted } = await scrape(username);
        // Push only posts that haven't been sent by the incremental-push
        // branch inside scrape(). Check the checkpoint for pushedUpTo.
        const cp = loadCheckpoint(username);
        const pushedUpTo = cp?.pushedUpTo ?? 0;
        const tail = posts.slice(pushedUpTo);
        if (tail.length > 0) {
          await pushToAPI(username, tail, profileStats);
          if (cp) {
            saveCheckpoint({ ...cp, pushedUpTo: posts.length });
          }
        } else {
          console.log(`[Scraper] Nothing new to push (incremental pushes already sent everything).`);
        }

        if (wasInterrupted) {
          console.log(`[Scraper] @${username} interrupted — checkpoint kept so you can resume next run.`);
          success = true; // Not a failure; user asked to stop.
          break;
        }

        // Clean finish — drop the checkpoint so the next run starts fresh.
        clearCheckpoint(username);
        console.log(`[Scraper] @${username} completed successfully on attempt ${attempt}.`);
        success = true;
        break;
      } catch (err) {
        console.error(
          `[Scraper] @${username} attempt ${attempt} failed:`,
          err instanceof Error ? err.message : err
        );
        if (interrupted) {
          console.log(`[Scraper] Interrupt flag set — not retrying. Checkpoint preserved.`);
          break;
        }
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

main().catch((err) => {
  console.error("[Scraper] Fatal error:", err);
  process.exit(1);
});
