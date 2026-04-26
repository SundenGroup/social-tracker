#!/usr/bin/env npx tsx
/**
 * Instagram post-detail backfill
 *
 * For posts already in the database that are missing titles (scraper
 * fell through to the old fallback path) or missing views (videos where
 * the private API was rate-limited), this script re-visits each post
 * page once, extracts the caption + interaction stats from the embedded
 * Schema.org JSON-LD, and pushes an update through /api/sync/ingest.
 *
 * Thanks to the ingest route's defensive guards, pushing partial data
 * won't overwrite fields that already have good values — only missing
 * ones get filled in.
 *
 * Flow:
 *   1. GET /api/sync/ig-missing-data to find candidate posts.
 *   2. Connect to the persistent Chrome session (same browser-server
 *      the scraper uses).
 *   3. For each post: navigate to the post URL, extract JSON-LD +
 *      og meta fallback, push to /api/sync/ingest.
 *   4. Checkpoint every N posts; Ctrl+C pauses cleanly and resumes
 *      next run.
 *
 * Usage:
 *   cd scripts/instagram-remote-scraper
 *   (browser-server.ts must be running — same prerequisite as scrape.ts)
 *   BACKFILL_USERNAME=pubgesports_kr npx tsx backfill-details.ts
 *
 * Or pass as CLI arg:
 *   npx tsx backfill-details.ts pubgesports_kr
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { EXTRACT_POST_PAGE_JS, type PostPageExtraction } from "./extract-post-page";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);

// Load .env from this script's directory (same file the main scraper uses)
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
const CHECKPOINT_EVERY = parseInt(process.env.CHECKPOINT_EVERY || "25", 10);
// Push every N successfully-extracted posts to /api/sync/ingest. Higher
// values mean fewer round-trips (faster) but a bigger blast radius if
// something dies between pushes. 300 is a sweet spot for long-running
// historical backfills — fast enough but you only ever lose ~5 minutes
// of work if the process is killed.
const PUSH_EVERY = parseInt(process.env.PUSH_EVERY || "300", 10);
const CHECKPOINT_TTL_MS = 7 * 24 * 3600_000;
const USERNAME = process.argv[2] || process.env.BACKFILL_USERNAME || "";

const CDP_FILE = path.join(SCRIPT_DIR, ".browser-cdp");
const PROFILE_DIR = path.join(SCRIPT_DIR, "browser-profile");

if (!API_TOKEN) {
  console.error("ERROR: API_TOKEN not set in .env");
  process.exit(1);
}
if (!USERNAME) {
  console.error("ERROR: Username required. Usage: npx tsx backfill-details.ts <username>");
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ───────── signal handling ─────────

let interrupted = false;
let sigintCount = 0;
process.on("SIGINT", () => {
  sigintCount++;
  if (sigintCount > 1) {
    console.log("\n[Backfill] Forced exit.");
    process.exit(130);
  }
  interrupted = true;
  console.log("\n[Backfill] Interrupt received — finishing current post, saving checkpoint, exiting...");
});
process.on("SIGTERM", () => { interrupted = true; });

// ───────── checkpoint ─────────

interface Candidate {
  postId: string;
  postType: string;
  contentUrl: string;
  missingTitle: boolean;
  missingViews: boolean;
}

interface Checkpoint {
  version: 1;
  username: string;
  startedAt: string;
  updatedAt: string;
  candidates: Candidate[];
  processed: string[]; // postIds we've already finished
  // Map of shortcode -> view count, harvested by the deep /reels/ grid
  // scroll at the start of the run. Stored in the checkpoint so a
  // Ctrl+C / crash doesn't waste the (multi-minute) grid scroll work.
  reelsViewMap?: Record<string, number>;
}

function checkpointPath(username: string): string {
  return path.join(SCRIPT_DIR, `backfill-checkpoint-${username}.json`);
}

function loadCheckpoint(username: string): Checkpoint | null {
  try {
    const raw = fs.readFileSync(checkpointPath(username), "utf-8");
    const cp = JSON.parse(raw) as Checkpoint;
    if (cp.version !== 1 || cp.username !== username) return null;
    const age = Date.now() - new Date(cp.updatedAt).getTime();
    if (age > CHECKPOINT_TTL_MS) {
      console.log(`[Backfill] Checkpoint is ${Math.round(age / 3600_000)}h old — discarding, starting fresh.`);
      return null;
    }
    return cp;
  } catch {
    return null;
  }
}

function saveCheckpoint(cp: Checkpoint) {
  cp.updatedAt = new Date().toISOString();
  const p = checkpointPath(cp.username);
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cp));
  fs.renameSync(tmp, p);
}

function clearCheckpoint(username: string) {
  try { fs.unlinkSync(checkpointPath(username)); } catch { /* ignore */ }
}

// ───────── browser connection ─────────
//
// Same two-tier logic as scrape.ts: if browser-server.ts is running
// (there's a .browser-cdp file with a WebSocket endpoint), connect to
// it; otherwise launch a fresh Chromium using the persistent profile
// directory so cookies / IG session state persist between runs.

async function connectToBrowser(): Promise<{
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
      console.log("[Backfill] Connected to running browser-server.");
      return { browser, context, standalone: false };
    } catch {
      console.log("[Backfill] Browser-server not reachable, launching standalone...");
    }
  } else {
    console.log("[Backfill] No browser-server found, launching standalone using persistent profile...");
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

// ───────── /reels/ grid view-count harvest ─────────
//
// Views are only rendered on /<username>/reels/ — never on individual
// post pages. So before going post-by-post, we deep-scroll the reels
// grid to build a {shortcode -> views} map covering every reel the
// account has. Per-post visits then look up views from this map.
//
// Each reel thumbnail has a small <svg aria-label="View count icon">
// next to the count. Walking up from each such SVG to the smallest
// ancestor with a numeric textContent gives the view count, position-
// agnostic (so layout reshuffles don't break us).

async function fetchReelsViewMap(page: Page, username: string): Promise<Record<string, number>> {
  const url = `https://www.instagram.com/${username}/reels/`;
  console.log(`[Backfill] Loading ${url} for deep grid scroll...`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3500);

  // Aggressive scroll — backfill needs ALL reels, not just today's most
  // recent. 500 max iterations with high stale-tolerance covers ~1500-
  // 2500 reels per account before IG runs out of content to serve.
  const MAX_SCROLLS = 500;
  const STALE_LIMIT = 30;
  let prevCount = 0;
  let stale = 0;

  // Track how many unique shortcodes we've seen on each scroll, to
  // know when IG has stopped serving more.
  const countShortcodes = async (): Promise<number> => {
    return await page.evaluate(`
      (() => {
        const seen = new Set();
        const anchors = document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"], a[href*="/tv/"]');
        for (const a of Array.from(anchors)) {
          const href = a.getAttribute("href") || "";
          const m = href.match(/\\/(reel|p|tv)\\/([A-Za-z0-9_-]+)/);
          if (m) seen.add(m[2]);
        }
        return seen.size;
      })()
    `) as number;
  };

  for (let i = 0; i < MAX_SCROLLS; i++) {
    if (interrupted) break;
    await page.evaluate("window.scrollBy(0, window.innerHeight * 1.6)");
    await page.waitForTimeout(900 + Math.random() * 700);

    const count = await countShortcodes();
    if (count === prevCount) {
      stale++;
      if (stale === Math.floor(STALE_LIMIT / 2)) {
        // Wake-up nudge: scroll up a viewport, then back down further
        await page.evaluate("window.scrollBy(0, -window.innerHeight)");
        await page.waitForTimeout(500);
        await page.evaluate("window.scrollBy(0, window.innerHeight * 3)");
        await page.waitForTimeout(1500);
      }
      if (stale >= STALE_LIMIT) {
        console.log(`[Backfill]   stale-scroll limit (${STALE_LIMIT}) hit at ${count} reels; assuming end of grid`);
        break;
      }
    } else {
      stale = 0;
      if (i % 10 === 0) {
        console.log(`[Backfill]   scroll ${i}: ${count} reels loaded so far`);
      }
    }
    prevCount = count;
  }

  // Now extract the {shortcode -> views} map from the loaded grid.
  console.log(`[Backfill]   extracting view counts via SVG aria-label walk...`);
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
        if (out[shortcode] != null) continue;
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

  console.log(`[Backfill] Grid scroll done. Captured view counts for ${Object.keys(grid).length} reels.`);
  return grid;
}

// ───────── post extraction ─────────

interface ExtractedPost {
  postId: string;
  postType: string;
  contentUrl: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };
}

async function extractFromPage(
  page: Page,
  c: Candidate,
  reelsViewMap: Record<string, number>
): Promise<ExtractedPost | null> {
  try {
    await page.goto(c.contentUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(2500 + Math.random() * 1000);

    const data = (await page.evaluate(EXTRACT_POST_PAGE_JS)) as PostPageExtraction;

    // Single-post page never has views — pull them from the grid map
    // we built before the per-post loop. Falls back to whatever the
    // extractor returned (usually 0) if not in map.
    const gridViews = reelsViewMap[c.postId] ?? 0;
    const views = gridViews || data.views;

    // Prefer the extractor's video detection; fall back to the candidate
    // hint we got from the API list (carousel/image stay as-is unless
    // we found views, in which case it's clearly a video).
    const postType = data.isVideo || gridViews > 0 ? "video" : c.postType || "image";

    return {
      postId: c.postId,
      postType,
      contentUrl: c.contentUrl,
      title: (data.caption || "").slice(0, 200),
      description: data.caption || "",
      thumbnailUrl: data.thumbnailUrl,
      publishedAt: data.publishedAt || new Date().toISOString(),
      metrics: {
        views,
        likes: data.likes,
        comments: data.comments,
        shares: 0,
      },
    };
  } catch (err) {
    console.log(`[Backfill]   ! ${c.postId} extract failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ───────── ingest push ─────────

async function pushBatch(username: string, posts: ExtractedPost[]): Promise<void> {
  if (posts.length === 0) return;
  const response = await fetch(`${API_URL}/api/sync/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({
      platform: "instagram",
      accountId: username,
      posts,
    }),
  });
  const txt = await response.text();
  if (!response.ok) {
    throw new Error(`Ingest ${response.status}: ${txt.slice(0, 300)}`);
  }
  const parsed = JSON.parse(txt);
  console.log(`[Backfill] Pushed ${posts.length} — server: Posts=${parsed.postsSynced} Metrics=${parsed.metricsSynced}`);
}

// ───────── main ─────────

async function fetchCandidates(username: string): Promise<Candidate[]> {
  const url = `${API_URL}/api/sync/ig-missing-data?accountId=${encodeURIComponent(username)}&limit=10000`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Candidate API ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { totalPosts: number; needsBackfill: number; posts: Candidate[] };
  console.log(`[Backfill] Server says: ${json.totalPosts} total posts, ${json.needsBackfill} need backfill`);
  return json.posts;
}

async function main() {
  console.log(`[Backfill] Starting for @${USERNAME}`);
  console.log(`[Backfill] Target: ${API_URL}`);

  // 1. Load or fetch candidate list
  let cp = loadCheckpoint(USERNAME);
  let candidates: Candidate[];
  let processed: Set<string>;
  if (cp) {
    candidates = cp.candidates;
    processed = new Set(cp.processed);
    console.log(`[Backfill] Resuming from checkpoint: ${processed.size}/${candidates.length} already done`);
  } else {
    candidates = await fetchCandidates(USERNAME);
    processed = new Set();
    cp = {
      version: 1,
      username: USERNAME,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      candidates,
      processed: [],
    };
    saveCheckpoint(cp);
  }

  if (candidates.length === 0) {
    console.log(`[Backfill] Nothing to backfill — all posts look complete.`);
    clearCheckpoint(USERNAME);
    return;
  }

  // 2. Connect to browser (reuse browser-server if running, else launch
  //    standalone via the persistent profile in browser-profile/).
  const { browser, context, standalone } = await connectToBrowser();
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  // 3. Warm up — navigate to IG root so the session is live
  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  // 4. Deep grid scroll — populate the {shortcode -> views} map so each
  //    per-post extraction has an authoritative view count to merge.
  //    Reuse from checkpoint if present (saves repeating the multi-min
  //    scroll on resume).
  let reelsViewMap: Record<string, number>;
  if (cp.reelsViewMap && Object.keys(cp.reelsViewMap).length > 0) {
    reelsViewMap = cp.reelsViewMap;
    console.log(`[Backfill] Reusing reels view map from checkpoint (${Object.keys(reelsViewMap).length} entries)`);
  } else {
    reelsViewMap = await fetchReelsViewMap(page, USERNAME);
    cp.reelsViewMap = reelsViewMap;
    saveCheckpoint(cp);
  }

  // 5. Per-post loop
  const remaining = candidates.filter((c) => !processed.has(c.postId));
  console.log(`[Backfill] Processing ${remaining.length} posts (checkpoint every ${CHECKPOINT_EVERY}, push every ${PUSH_EVERY})`);

  const batch: ExtractedPost[] = [];
  let successes = 0;
  let failures = 0;
  const startTs = Date.now();

  for (let i = 0; i < remaining.length; i++) {
    if (interrupted) {
      console.log(`[Backfill] Interrupted — ${successes} succeeded, ${batch.length} in pending batch`);
      break;
    }
    const c = remaining[i];
    const extracted = await extractFromPage(page, c, reelsViewMap);
    if (extracted) {
      batch.push(extracted);
      successes++;
    } else {
      failures++;
    }
    processed.add(c.postId);

    if ((i + 1) % 10 === 0) {
      const elapsed = (Date.now() - startTs) / 1000;
      const rate = (i + 1) / elapsed;
      const remaining_sec = (remaining.length - i - 1) / Math.max(rate, 0.1);
      console.log(
        `[Backfill] ${i + 1}/${remaining.length} done (${successes} ok, ${failures} fail) — ` +
        `${rate.toFixed(1)}/s, ~${Math.round(remaining_sec / 60)} min remaining`
      );
    }

    // Checkpoint + incremental push
    if ((i + 1) % CHECKPOINT_EVERY === 0) {
      cp.processed = Array.from(processed);
      saveCheckpoint(cp);
    }
    if (batch.length >= PUSH_EVERY) {
      try {
        await pushBatch(USERNAME, batch);
        batch.length = 0;
        cp.processed = Array.from(processed);
        saveCheckpoint(cp);
      } catch (err) {
        console.log(`[Backfill] Push failed (will retry at end): ${err instanceof Error ? err.message : err}`);
      }
    }

    // Gentle delay to stay polite
    await sleep(800 + Math.random() * 800);

    // Too many consecutive failures → bail out
    if (failures > 30 && successes < 5) {
      console.log(`[Backfill] Too many failures early on — aborting, check the browser state`);
      break;
    }
  }

  // 5. Final flush
  if (batch.length > 0) {
    try {
      await pushBatch(USERNAME, batch);
    } catch (err) {
      console.log(`[Backfill] Final push failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 6. Save final checkpoint + decide if we're done
  cp.processed = Array.from(processed);
  saveCheckpoint(cp);

  const totalDone = processed.size;
  console.log(`\n[Backfill] @${USERNAME}: ${totalDone}/${candidates.length} processed (${successes} success, ${failures} fail)`);

  if (!interrupted && totalDone >= candidates.length) {
    clearCheckpoint(USERNAME);
    console.log(`[Backfill] Complete — checkpoint cleared.`);
  } else if (interrupted) {
    console.log(`[Backfill] Interrupted — resume with: npx tsx backfill-details.ts ${USERNAME}`);
  }

  // Tidy up. Don't close the browser-server — scrape.ts may want it
  // again. Only close when we launched our own standalone instance.
  if (standalone) {
    try { await context.close(); } catch { /* already closed */ }
  } else if (browser) {
    try { await browser.close(); } catch { /* connect-only, may throw */ }
  }
}

main().catch((err) => {
  console.error("[Backfill] Fatal:", err);
  process.exit(1);
});
