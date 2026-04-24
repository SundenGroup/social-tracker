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
const PUSH_EVERY = parseInt(process.env.PUSH_EVERY || "50", 10); // push every 50 by default for backfill
const CHECKPOINT_TTL_MS = 7 * 24 * 3600_000;
const USERNAME = process.argv[2] || process.env.BACKFILL_USERNAME || "";

const CDP_FILE = path.join(SCRIPT_DIR, ".browser-cdp");

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

// ───────── browser connection (reuse CDP session) ─────────

async function connectToBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  if (!fs.existsSync(CDP_FILE)) {
    throw new Error(
      `No CDP endpoint file found at ${CDP_FILE}. ` +
      `Start browser-server.ts first (same prerequisite as scrape.ts).`
    );
  }
  const wsEndpoint = fs.readFileSync(CDP_FILE, "utf-8").trim();
  console.log(`[Backfill] Connecting to browser at ${wsEndpoint}...`);
  const browser = await chromium.connectOverCDP(wsEndpoint);
  const contexts = browser.contexts();
  const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
  return { browser, context };
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

async function extractFromPage(page: Page, c: Candidate): Promise<ExtractedPost | null> {
  try {
    await page.goto(c.contentUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1500 + Math.random() * 1000);

    const data = await page.evaluate(`
      (() => {
        const pc = (s) => {
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

        // JSON-LD primary
        let jsonLd = null;
        const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const sc of Array.from(ldScripts)) {
          try {
            const raw = JSON.parse(sc.textContent || "{}");
            const nodes = Array.isArray(raw) ? raw : (Array.isArray(raw["@graph"]) ? raw["@graph"] : [raw]);
            for (const n of nodes) {
              const t = n && n["@type"];
              if (t === "VideoObject" || t === "SocialMediaPosting" || t === "ImageObject") {
                jsonLd = n;
                break;
              }
            }
            if (jsonLd) break;
          } catch (e) { /* skip */ }
        }

        let caption = "";
        let ldViews = 0;
        let ldLikes = 0;
        let ldComments = 0;
        let ldThumb = null;
        let ldPublishedAt = "";
        let isVideoObject = false;

        if (jsonLd) {
          isVideoObject = jsonLd["@type"] === "VideoObject";
          caption = jsonLd.caption || jsonLd.articleBody || jsonLd.description || "";
          ldThumb = jsonLd.thumbnailUrl || (Array.isArray(jsonLd.thumbnailUrl) ? jsonLd.thumbnailUrl[0] : null) || null;
          ldPublishedAt = jsonLd.uploadDate || jsonLd.datePublished || "";

          const stats = jsonLd.interactionStatistic;
          const arr = Array.isArray(stats) ? stats : (stats ? [stats] : []);
          for (const st of arr) {
            const t = st && st.interactionType;
            const typeStr = typeof t === "string" ? t : (t && t["@type"]) || "";
            const count = Number(st.userInteractionCount) || 0;
            if (/WatchAction/i.test(typeStr)) ldViews = count;
            else if (/LikeAction/i.test(typeStr)) ldLikes = count;
            else if (/CommentAction|ReplyAction/i.test(typeStr)) ldComments = count;
          }
        }

        // og: fallback
        const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;
        const timeEl = document.querySelector("time[datetime]");

        if (!caption && ogDesc) {
          const captionMatch = ogDesc.match(/on Instagram[:\\s]*["'\\u201C\\u201D]([\\s\\S]*?)["'\\u201C\\u201D](?:\\s*$|\\s*\\.\\s*$|\\s*Follow\\b)/i);
          if (captionMatch) caption = captionMatch[1];
        }

        const likeM = ogDesc.match(/([\\d,.KMBkmb]+)\\s*likes?/i);
        const commentM = ogDesc.match(/([\\d,.KMBkmb]+)\\s*comments?/i);
        const ogLikes = likeM ? pc(likeM[1]) : 0;
        const ogComments = commentM ? pc(commentM[1]) : 0;

        return {
          caption,
          isVideoObject,
          views: ldViews,
          likes: ldLikes || ogLikes,
          comments: ldComments || ogComments,
          publishedAt: ldPublishedAt || (timeEl && timeEl.getAttribute("datetime")) || "",
          thumbnailUrl: ldThumb || ogImage,
        };
      })()
    `) as {
      caption: string;
      isVideoObject: boolean;
      views: number;
      likes: number;
      comments: number;
      publishedAt: string;
      thumbnailUrl: string | null;
    };

    const postType = data.isVideoObject ? "video" : c.postType || "image";

    return {
      postId: c.postId,
      postType,
      contentUrl: c.contentUrl,
      title: (data.caption || "").slice(0, 200),
      description: data.caption || "",
      thumbnailUrl: data.thumbnailUrl,
      publishedAt: data.publishedAt || new Date().toISOString(),
      metrics: {
        views: data.views,
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

  // 2. Connect to browser
  const { browser, context } = await connectToBrowser();
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  // 3. Warm up — navigate to IG root so the session is live
  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  // 4. Per-post loop
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
    const extracted = await extractFromPage(page, c);
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

  try { await browser.close(); } catch { /* connect-only, may throw */ }
}

main().catch((err) => {
  console.error("[Backfill] Fatal:", err);
  process.exit(1);
});
