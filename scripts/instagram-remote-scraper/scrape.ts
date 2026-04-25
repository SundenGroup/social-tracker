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
 * Extract a post's caption from the og:title meta of its post page.
 *
 * As of late April 2026, IG's private /api/v1/media/<id>/info/ response
 * stopped including caption.text for non-business clients (similar to
 * the play_count strip). The page itself still has the caption inside
 * <meta property="og:title">, formatted as:
 *
 *   "Display Name | Brand on Instagram: \"actual caption text\""
 *
 * We slice everything after the literal "on Instagram:" delimiter and
 * strip a leading/trailing quote. Returns "" on failure (caller decides
 * whether to keep the previously-extracted value).
 */
async function fetchCaptionFromPage(page: Page, href: string): Promise<string> {
  try {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(1500 + Math.random() * 800);
    const caption = await page.evaluate(`
      (() => {
        const stripQuotes = (s) => {
          let out = (s || "").trim();
          out = out.replace(/^["\\u201C\\u2018]/, "");
          out = out.replace(/["\\u201D\\u2019]\\s*$/, "");
          return out.trim();
        };

        // Primary: og:title — "<Account> on Instagram: \\"caption\\""
        const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
        const titleIdx = ogTitle.lastIndexOf("on Instagram:");
        if (titleIdx >= 0) {
          const candidate = stripQuotes(ogTitle.slice(titleIdx + "on Instagram:".length));
          if (candidate) return candidate;
        }

        // Fallback: og:description — "X likes, Y comments - <user> on
        // Month DD, YYYY: \\"caption\\"". Some image posts don't include
        // the caption in og:title but DO put it in og:description.
        const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
        const descMatch = ogDesc.match(/\\son\\s+(?:[A-Z][a-z]+\\s+\\d{1,2},\\s*\\d{4}|Instagram)[:\\s]+([\\s\\S]+)$/);
        if (descMatch) {
          const candidate = stripQuotes(descMatch[1]);
          if (candidate) return candidate;
        }

        return "";
      })()
    `);
    return (caption as string) || "";
  } catch {
    return "";
  }
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
}

/**
 * Scrape a single Instagram account.
 */
async function scrape(username: string): Promise<ScrapeResult> {
  const { browser, context, standalone } = await getBrowser();
  const interactive = SETUP_MODE;

  if (interactive) {
    console.log("[Scraper] INTERACTIVE MODE — script will pause so you can interact with the browser.");
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
    // Scrape both the main Posts tab and the Reels tab to get all content
    // Instagram uses virtual scrolling — it removes off-screen elements from the DOM.
    // We must collect links DURING scrolling, not just at the end.
    const allPostLinks = new Map<string, { shortcode: string; href: string; type: string }>();
    // Map<shortcode, views> harvested from /<user>/reels/ grid via the
    // SVG aria-label="View count icon" walk. Populated below during the
    // Reels-tab scroll pass; looked up in the per-post loop because IG
    // strips play_count from the per-post API response.
    const reelsViewMap: Record<string, number> = {};

    const collectLinksFromPage = async () => {
      const links: { shortcode: string; href: string; type: string }[] = await page.$$eval(
        'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
        (els) => {
          const result: { shortcode: string; href: string; type: string }[] = [];
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

      for (let i = 0; i < 30; i++) {
        await page.evaluate("window.scrollBy(0, window.innerHeight * 2)");
        await page.waitForTimeout(1500 + Math.random() * 1500);

        // Collect links after each scroll (before they get virtualized away)
        await collectLinksFromPage();

        if (allPostLinks.size >= MAX_POSTS) break;
        if (allPostLinks.size === prevTotalCount) {
          staleScrolls++;
          if (staleScrolls >= 5) break;
        } else {
          staleScrolls = 0;
          if (i % 5 === 0) console.log(`[Scraper] ... ${allPostLinks.size} posts collected (${tab.label})`);
        }
        prevTotalCount = allPostLinks.size;
      }

      console.log(`[Scraper] ${allPostLinks.size} total unique posts after ${tab.label} tab`);

      // ===== Grid view-count harvest (Reels tab only) =====
      // Each thumbnail's view count sits next to a tiny SVG icon with
      // aria-label="View count icon". Walk up from each such SVG (within
      // the thumbnail's <a>) until we find an ancestor whose textContent
      // contains a number — that's the view count. Position-agnostic, so
      // it doesn't matter where IG places the count in the grid layout.
      // Validated empirically on /pubgesports/reels/:
      //   DXPukGODktA → views=1,000,000 ✓ (real)
      //   DXiaXRuiKuQ → views=3,118 ✓ (matches user's eyes minus drift)
      if (tab.label === "Reels") {
        const grid = await page.evaluate(`
          (() => {
            const parseCount = (s) => {
              if (!s) return 0;
              const cleaned = String(s).replace(/[,\\s]/g, "");
              const m = cleaned.match(/([\\d.]+)([KMBkmb])?/);
              if (!m) return 0;
              const num = parseFloat(m[1]);
              const suf = (m[2] || "").toUpperCase();
              if (suf === "K") return Math.round(num * 1000);
              if (suf === "M") return Math.round(num * 1000000);
              if (suf === "B") return Math.round(num * 1000000000);
              return Math.round(num);
            };
            const out = {};
            const anchors = document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"], a[href*="/tv/"]');
            for (const a of Array.from(anchors)) {
              const href = a.getAttribute("href") || "";
              const m = href.match(/\\/(reel|p|tv)\\/([A-Za-z0-9_-]+)/);
              if (!m) continue;
              const shortcode = m[2];
              if (out[shortcode] != null) continue; // first thumbnail wins
              const viewSvgs = a.querySelectorAll('svg[aria-label="View count icon"]');
              for (const svg of Array.from(viewSvgs)) {
                let cur = svg.parentElement;
                let found = 0;
                for (let hop = 0; hop < 5 && cur && cur !== a; hop++) {
                  const text = cur.textContent || "";
                  const numMatch = text.match(/[\\d.,]+\\s*[KkMmBb]?/);
                  if (numMatch) {
                    const n = parseCount(numMatch[0]);
                    if (n > 0) { found = n; break; }
                  }
                  cur = cur.parentElement;
                }
                if (found > 0) { out[shortcode] = found; break; }
              }
            }
            return out;
          })()
        `) as Record<string, number>;
        Object.assign(reelsViewMap, grid);
        console.log(`[Scraper] Captured grid view counts for ${Object.keys(grid).length} reels`);
      }
    }

    const postLinks = Array.from(allPostLinks.values());
    console.log(`[Scraper] Found ${postLinks.length} unique post links total`);

    if (postLinks.length === 0) {
      await page.screenshot({ path: path.join(SCRIPT_DIR, `debug-screenshot-${username}.png`) });
      throw new Error("No posts found on profile (login wall or page load issue)");
    }

    // Limit to MAX_POSTS
    const toScrape = postLinks.slice(0, MAX_POSTS);

    // --- Step 5: Visit each post page to get full details ---
    console.log(`[Scraper] Scraping details for ${toScrape.length} posts...`);
    const posts: ScrapedPost[] = [];
    let failures = 0;

    // Navigate to Instagram homepage first to ensure cookies are active for API calls
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    for (let i = 0; i < toScrape.length; i++) {
      const { shortcode, href, type } = toScrape[i];

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
          // API failed — fall back to page scraping for basic data
          await page.goto(href, { waitUntil: "domcontentloaded", timeout: 20000 });
          await page.waitForTimeout(2000 + Math.random() * 1500);

          const fallbackData = await page.evaluate(`
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

              const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
              const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
              const likeM = ogDesc.match(/([\\d,.KMBkmb]+)\\s*likes?/i);
              const commentM = ogDesc.match(/([\\d,.KMBkmb]+)\\s*comments?/i);
              const timeEl = document.querySelector("time[datetime]");
              const thumbnailUrl = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;

              // Caption: try og:title first ("Brand on Instagram: \\"caption\\"")
              // then og:description ("X likes, Y comments - user on Month DD,
              // YYYY: \\"caption\\"") — some image posts only include the
              // caption in one of the two.
              const stripQuotes = (s) => {
                let out = (s || "").trim();
                out = out.replace(/^["\\u201C\\u2018]/, "");
                out = out.replace(/["\\u201D\\u2019]\\s*$/, "");
                return out.trim();
              };
              let caption = "";
              const titleIdx = ogTitle.lastIndexOf("on Instagram:");
              if (titleIdx >= 0) {
                caption = stripQuotes(ogTitle.slice(titleIdx + "on Instagram:".length));
              }
              if (!caption) {
                const descMatch = ogDesc.match(/\\son\\s+(?:[A-Z][a-z]+\\s+\\d{1,2},\\s*\\d{4}|Instagram)[:\\s]+([\\s\\S]+)$/);
                if (descMatch) caption = stripQuotes(descMatch[1]);
              }

              return {
                caption,
                likes: likeM ? pc(likeM[1]) : 0,
                comments: commentM ? pc(commentM[1]) : 0,
                publishedAt: timeEl?.getAttribute("datetime") || "",
                thumbnailUrl,
              };
            })()
          `);

          // Look up views from the /reels/ grid SVG-walk we did earlier.
          // Returns 0 for non-reel posts (images / image-carousels), which
          // the ingest's `value > 0` guard then drops without writing.
          const gridViews = reelsViewMap[shortcode] ?? 0;
          posts.push({
            postId: shortcode,
            title: (fallbackData.caption || "").slice(0, 200),
            description: fallbackData.caption || "",
            contentUrl: href,
            thumbnailUrl: fallbackData.thumbnailUrl,
            publishedAt: fallbackData.publishedAt || new Date().toISOString(),
            postType: type === "video" ? "video" : "image",
            metrics: {
              views: gridViews,
              likes: fallbackData.likes,
              comments: fallbackData.comments,
              shares: 0,
            },
          });
        } else {
          // API succeeded — use the full data
          const apiViews = apiResult.play_count || apiResult.video_view_count || 0;
          const likes = apiResult.like_count || 0;
          const commentCount = apiResult.comment_count || 0;
          const shares = apiResult.share_count || apiResult.reshare_count || 0;
          const takenAt = apiResult.taken_at || 0;
          const mediaType = apiResult.media_type || 0;
          let caption = apiResult.caption || "";

          let postType = type;
          if (mediaType === 2) postType = "video";
          else if (mediaType === 8) postType = "carousel";
          else if (mediaType === 1) postType = "image";

          // Same erosion as play_count: IG silently dropped caption.text
          // from the API response for non-business clients in late April
          // 2026. When that happens, fetch the post page and read
          // og:title — the caption is still rendered there.
          if (!caption) {
            caption = await fetchCaptionFromPage(page, href);
          }

          // The private API stopped returning play_count for non-business
          // clients in April 2026. Fall back to the /reels/ grid view
          // count (extracted via SVG aria-label="View count icon" walk
          // earlier in the run). For non-reel posts the map is empty,
          // so views=0 and the ingest's value > 0 guard drops the write.
          const views = apiViews || reelsViewMap[shortcode] || 0;

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
          console.log(`[Scraper] ... ${i + 1}/${toScrape.length} posts scraped (${posts.length} successful)`);
        }

        // Small delay between API calls to avoid rate limiting
        if (i < toScrape.length - 1) {
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

    console.log(`[Scraper] Scraped ${posts.length} posts with details (${failures} failures)`);

    if (posts.length === 0) {
      throw new Error("Failed to scrape any post details");
    }

    // Navigate away so browser isn't sitting on Instagram between runs
    await page.goto("about:blank").catch(() => {});

    return { posts, profileStats };
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
        const { posts, profileStats } = await scrape(username);
        await pushToAPI(username, posts, profileStats);
        console.log(`[Scraper] @${username} completed successfully on attempt ${attempt}.`);
        success = true;
        break;
      } catch (err) {
        console.error(
          `[Scraper] @${username} attempt ${attempt} failed:`,
          err instanceof Error ? err.message : err
        );
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
