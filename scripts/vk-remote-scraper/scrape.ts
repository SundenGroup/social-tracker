/**
 * VK Remote Scraper — runs from a residential-IP machine (Simon's Mac).
 *
 * Pipeline per VK group:
 *   1. Playwright loads vk.com/<short_name>, waits for posts to render.
 *   2. Auto-dismisses the sign-up / "open in app" modals VK shows logged-out
 *      visitors — they overlap the counters we want to read.
 *   3. For each post card in the DOM:
 *        - Extracts post ID, text, publish date (ISO or VK's relative format)
 *        - Extracts wall-level likes / comments / reposts via a cascade of
 *          modern + classic VK selectors.
 *        - Regex-matches any `video-<oid>_<id>` reference in the post's HTML
 *          and keeps the first one (VK's primary video attachment).
 *   4. For each unique video ID, hits `vk.com/video_ext.php` (unauth,
 *      works anywhere) to pull the video view count.
 *   5. Dumps the first post's outerHTML to `debug-<acct>-post-0.html` so
 *      we can audit selectors against the real DOM.
 *   6. POSTs everything to /api/sync/ingest — one SocialAccount per run.
 *
 * Followers / member count comes from the group header text.
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
import { readFileSync, writeFileSync, existsSync } from "fs";
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

// ───────── helpers ─────────

/**
 * Dismisses VK's sign-up / "install app" overlays that float on top of the
 * feed for logged-out visitors. They pop up on a timer and can cover the
 * post footer counters. We try a close-button click first, then Escape,
 * then brute-force removal of overlay nodes.
 */
async function dismissOverlays(page: Page): Promise<void> {
  try {
    // Click any visible close button
    await page.evaluate(() => {
      const selectors = [
        '[class*="ReactCloseBtn"]',
        '[class*="Modal__close"]',
        '[class*="Modal__closeBtn"]',
        '[class*="SignupModal"] [class*="close"]',
        '[aria-label*="close" i]',
        '[aria-label*="закрыть" i]',
        'button[class*="Close"]',
        '#box_close',
        '.UnauthActionBox__close',
      ];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el) => {
          try {
            (el as HTMLElement).click();
          } catch {
            /* element might be detached */
          }
        });
      }
    });
    await page.keyboard.press("Escape").catch(() => null);
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape").catch(() => null);
    await page.waitForTimeout(200);
    // Last resort: hide obvious overlays so they can't block us
    await page.evaluate(() => {
      const hideSelectors = [
        '[class*="SignupBanner"]',
        '[class*="UnauthActionBox"]',
        '[class*="InstallAppBanner"]',
        '[class*="AppTeaser"]',
        '[role="dialog"]',
      ];
      for (const sel of hideSelectors) {
        document.querySelectorAll(sel).forEach((el) => {
          (el as HTMLElement).style.display = "none";
        });
      }
    });
  } catch (err) {
    console.warn(`[VK] dismissOverlays: ${err}`);
  }
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

  // tsx compiles our TS with esbuild's keepNames=true, which emits
  // `__name(fn, "name")` wrappers around function declarations. When
  // Playwright serializes a TS callback for page.evaluate, those refs go
  // with it — but the page context has no __name helper, so evaluate fails
  // with "ReferenceError: __name is not defined". Inject a no-op shim on
  // every page navigation.
  await context.addInitScript(() => {
    // @ts-expect-error - runtime shim; window.__name isn't a real global
    if (!window.__name) window.__name = (fn: unknown) => fn;
  });

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

    // Dismiss overlays that popped up during initial render
    await dismissOverlays(page);

    // Gently scroll to load more posts (VK lazy-loads as you scroll).
    for (let i = 0; i < 4; i++) {
      await page.evaluate("window.scrollBy(0, window.innerHeight * 1.5)");
      await page.waitForTimeout(900);
      // Dismiss anything that popped up during scroll
      if (i === 1) await dismissOverlays(page);
    }
    await page.evaluate("window.scrollTo(0, 0)");
    await page.waitForTimeout(500);
    await dismissOverlays(page);

    // Extract group numeric id + follower count from the page data
    const groupMeta = await page.evaluate(() => {
      // Owner id is embedded in post IDs and in VK's data attributes. Pull
      // the first one we can find.
      const postEl = document.querySelector('[id^="post"]');
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

    // Pull posts out of the DOM. Each top-level post card has
    // `data-testid="post"`; reply threads reuse the `id="post-<oid>_<id>"`
    // pattern but live inside `.reply` wrappers. We filter those out or
    // we'd scrape every comment as a wall post.
    const rawPosts = await page.evaluate((max: number) => {
      // Helper: parse VK's number formats — "1.2K", "1 234", "5 тыс.", "42"
      const parseNumber = (s: string | null | undefined): number | null => {
        if (!s) return null;
        const normalized = s
          .replace(/[\u00A0\s,]/g, " ")
          .replace(/\bтыс\.?/gi, "K")
          .replace(/\bмлн\.?/gi, "M");
        const m = normalized.match(/(\d+(?:[.,]\d+)?)\s*([KMBkmb])?/);
        if (!m) return null;
        const base = parseFloat(m[1].replace(",", "."));
        if (isNaN(base)) return null;
        const suffix = (m[2] || "").toUpperCase();
        if (suffix === "K") return Math.round(base * 1000);
        if (suffix === "M") return Math.round(base * 1_000_000);
        if (suffix === "B") return Math.round(base * 1_000_000_000);
        return Math.round(base);
      };

      // Read a counter from the FIRST direct action-bar element matching
      // any selector. We scope the query to the post's main action row
      // (`.like_wrap` / `.PostBottomActionLikeBtns`) if we can find one,
      // so we don't pick up numbers from embedded reply threads below.
      const readCounter = (scope: Element, selectors: string[]): number | null => {
        for (const sel of selectors) {
          const el = scope.querySelector(sel);
          if (!el) continue;
          const aria = el.getAttribute("aria-label");
          const dataCount = el.getAttribute("data-count");
          const dataReactionCounts = el.getAttribute("data-reaction-counts");
          const text = (el as HTMLElement).innerText || el.textContent || "";
          // data-reaction-counts is a JSON array like "[33]" — sum entries
          if (dataReactionCounts) {
            try {
              const arr = JSON.parse(dataReactionCounts);
              if (Array.isArray(arr)) {
                const sum = arr.reduce((a: number, b: number) => a + (Number(b) || 0), 0);
                if (sum > 0 || arr.length > 0) return sum;
              }
            } catch {
              /* fall through */
            }
          }
          const n = parseNumber(aria) ?? parseNumber(dataCount) ?? parseNumber(text);
          if (n != null) return n;
        }
        return null;
      };

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
        videoMatch: string | null;
        outerHtml: string;
      }> = [];

      // Primary selector: data-testid="post" only matches top-level wall
      // posts on VK's current React redesign. Fall back to id-starts-with
      // for older skin, filtering out replies by class.
      let nodes: Element[] = Array.from(document.querySelectorAll('[data-testid="post"]'));
      if (nodes.length === 0) {
        nodes = Array.from(document.querySelectorAll('[id^="post"]')).filter(
          (n) => !n.classList.contains("reply") && !n.closest(".reply, .replies_list")
        );
      }

      const seen = new Set<string>();
      for (const node of nodes) {
        if (out.length >= max) break;
        // Prefer data-post-id (clean "<oid>_<localId>" with sign) over
        // parsing the dom id string.
        const dpi = node.getAttribute("data-post-id") || "";
        let oid = "", localId = "";
        const dpiMatch = dpi.match(/^(-?\d+)_(\d+)$/);
        if (dpiMatch) {
          oid = dpiMatch[1];
          localId = dpiMatch[2];
        } else {
          const idMatch = (node as HTMLElement).id.match(/^post(-?\d+)_(\d+)$/);
          if (!idMatch) continue;
          oid = idMatch[1];
          localId = idMatch[2];
        }
        const key = `${oid}_${localId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Text — VK's React skin wraps the body in wall_post_text_wrapper,
        // inside which lives vkitPostText__root / vkitFeedShowMoreText__text.
        // Classic skin uses .wall_post_text.
        const textSelectors = [
          '[class*="vkitFeedShowMoreText__text"]',
          '[class*="wall_post_text_wrapper"] [class*="vkitPostText__root"]',
          '[class*="wall_post_text_wrapper"]',
          '[data-testid="wall_post_text"]',
          '[class*="PostContent__text"]',
          '.wall_post_text',
          '.post_text',
        ];
        let text = "";
        for (const sel of textSelectors) {
          const el = node.querySelector(sel) as HTMLElement | null;
          const raw = el?.innerText?.trim();
          if (raw) {
            // Strip the trailing "Show more" button label if caught
            text = raw.replace(/\s*Show more\s*$/i, "").replace(/\s*Показать полностью\s*\.?$/i, "").trim();
            break;
          }
        }

        // Permalink + date share the same element on modern VK
        const dateLink = node.querySelector(
          '[data-testid="post_date_block_preview"], [class*="PostDateBlock"] a, a.post_link, a.post_date'
        ) as HTMLAnchorElement | null;
        const permalink =
          dateLink?.href ||
          (node.querySelector(`a[href*="wall${oid}_${localId}"]`) as HTMLAnchorElement | null)?.href ||
          "";

        // Thumbnail — skip avatars (AvatarRich class) and emoji/sticker
        const imgs = Array.from(node.querySelectorAll("img")) as HTMLImageElement[];
        const thumb =
          imgs.find((i) => {
            const cls = i.className || "";
            if (cls.includes("AvatarRich") || cls.includes("post_field_user_image")) return false;
            if (cls.includes("image_status")) return false;
            if (i.src.includes("/sticker")) return false;
            if (i.src.includes("/emoji/")) return false;
            if (i.src.includes("/photos_bytes/")) return false;
            // Must be reasonably sized to be a post thumbnail
            const attrW = Number(i.getAttribute("width") || "0");
            return i.naturalWidth > 150 || i.width > 150 || attrW > 150;
          })?.src ?? null;

        // Date — text from the dateLink, plus <time> fallback
        const timeEl = node.querySelector("time") as HTMLTimeElement | null;
        const date =
          timeEl?.getAttribute("datetime") ||
          timeEl?.getAttribute("title") ||
          timeEl?.innerText ||
          dateLink?.getAttribute("data-ts") ||
          dateLink?.getAttribute("title") ||
          (dateLink?.innerText || dateLink?.textContent || "").trim() ||
          null;

        // Counters live inside `.like_wrap` for the main post. Scope to that
        // so we don't catch reply-thread counters embedded further down.
        const footer = node.querySelector(
          '.like_wrap, [class*="PostBottomActionLikeBtns"], [class*="PostButtonReactionsContainer"]'
        ) || node;

        // Likes — react-skin renders count in PostButtonReactions__title OR
        // on the button via data-reaction-counts="[N]". Classic skin uses
        // .like_button_count.
        const likes = readCounter(footer as Element, [
          '[class*="PostButtonReactions__title"]',
          '[class*="PostButtonReactions"][data-reaction-counts]',
          '[data-reaction-counts]',
          '[class*="_like_button_count"]',
          '.like_button_count',
        ]);

        // Shares / reposts — .share._share with data-count OR PostBottomAction share
        const reposts = readCounter(footer as Element, [
          '[class*="PostBottomAction"].share[data-count]',
          '.PostBottomAction.share',
          '[class*="_share"][data-count]',
          '[aria-label$=" shares"]',
          '[aria-label$=" share"]',
          '[aria-label*="репост" i]',
          '[aria-label*="подел" i]',
        ]);

        // Comments — there's no dedicated counter on the wall post footer.
        // Derive from the reply thread: direct .reply children of
        // .replies_list + the data-count on .replies_next_main ("Show N more").
        let comments: number | null = null;
        const repliesList = node.querySelector(".replies_list, ._replies_list") as HTMLElement | null;
        if (repliesList) {
          // Direct-child reply count
          const visible = Array.from(repliesList.children).filter(
            (c) => c.classList.contains("reply") || (c.id && /^post(-?\d+)_\d+$/.test(c.id))
          ).length;
          const moreLink = node.querySelector(
            ".replies_next_main[data-count], a[class*='replies_next_main'][data-count]"
          );
          const more = moreLink ? Number(moreLink.getAttribute("data-count")) || 0 : 0;
          comments = visible + more;
        }
        // If closed_comments is set and we got 0, fall back to null (unknown)
        if (comments === 0 && node.classList.contains("closed_comments")) {
          comments = null;
        }

        // Video attachment — VK redesign stores the id cleanly in data-video
        let videoMatch: string | null = null;
        const videoLink = node.querySelector(
          'a[data-video], a[href*="/video-"], a[href*="/video?z=video"], a[href*="video_ext"], [data-video-id]'
        ) as HTMLElement | null;
        if (videoLink) {
          const dv =
            videoLink.getAttribute("data-video") ||
            videoLink.getAttribute("data-video-id") ||
            "";
          const href = (videoLink as HTMLAnchorElement).href || "";
          const pool = `${dv} ${href}`;
          const vm = pool.match(/(-?\d+)_(\d+)/);
          if (vm) videoMatch = `${vm[1]}_${vm[2]}`;
        }
        if (!videoMatch) {
          const vm = (node as HTMLElement).outerHTML.match(/video(-?\d+)_(\d+)/);
          if (vm) videoMatch = `${vm[1]}_${vm[2]}`;
        }

        out.push({
          oid,
          localId,
          text,
          permalink,
          thumb,
          date,
          likes,
          comments,
          reposts,
          videoMatch,
          outerHtml: (node as HTMLElement).outerHTML.slice(0, 100_000),
        });
      }
      return out;
    }, MAX_POSTS);

    console.log(`[VK:${shortName}] Found ${rawPosts.length} posts on the wall`);

    // Dump the first post's HTML so we can audit selectors against the real
    // DOM without re-running the scraper. Also write a quick extraction
    // report alongside so we can see which fields missed at a glance.
    if (rawPosts.length > 0) {
      const dbgPath = join(SCRIPT_DIR, `debug-${shortName}-post-0.html`);
      writeFileSync(dbgPath, rawPosts[0].outerHtml, "utf8");
      console.log(`[VK:${shortName}] Wrote debug HTML → ${dbgPath}`);

      const miss = {
        text: rawPosts.filter((p) => !p.text).length,
        date: rawPosts.filter((p) => !p.date).length,
        likes: rawPosts.filter((p) => p.likes == null).length,
        comments: rawPosts.filter((p) => p.comments == null).length,
        reposts: rawPosts.filter((p) => p.reposts == null).length,
        video: rawPosts.filter((p) => !p.videoMatch).length,
      };
      console.log(
        `[VK:${shortName}] Extraction misses: text=${miss.text}/${rawPosts.length} date=${miss.date} likes=${miss.likes} comments=${miss.comments} reposts=${miss.reposts} video=${miss.video}`
      );
    }

    const scrapedAtMs = Date.now();
    const posts: ScrapedPost[] = rawPosts.map((p, idx) => {
      const attachedVideoId = p.videoMatch ?? undefined;

      return {
        postId: p.localId,
        description: p.text.slice(0, 10_000),
        title: p.text.slice(0, 200),
        contentUrl: p.permalink || `https://vk.com/wall${p.oid}_${p.localId}`,
        thumbnailUrl: p.thumb ?? undefined,
        publishedAt: parseVkDate(p.date, scrapedAtMs, idx),
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

/**
 * Parses VK's date formats: ISO datetime, unix ts, or human relative like
 * "2 ч назад", "5 min ago", "сегодня в 14:30", "Jul 12 at 10:30 PM".
 *
 * If nothing parses, falls back to `scrapedAt - (idx * 60_000)` ms so that
 * posts land in feed order rather than all at the same moment.
 */
function parseVkDate(raw: string | null, scrapedAtMs: number, idx: number): string {
  const fallback = () => new Date(scrapedAtMs - idx * 60_000).toISOString();
  if (!raw) return fallback();
  const s = raw.trim();
  if (!s) return fallback();

  // Pure numeric → unix seconds (VK's data-ts attribute)
  if (/^\d{9,11}$/.test(s)) {
    return new Date(Number(s) * 1000).toISOString();
  }
  if (/^\d{12,13}$/.test(s)) {
    return new Date(Number(s)).toISOString();
  }

  // Try native parse for ISO dates + long-form English dates
  const direct = Date.parse(s);
  if (!isNaN(direct)) return new Date(direct).toISOString();

  const lower = s.toLowerCase();
  const now = scrapedAtMs;
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  // English + Russian relative: "N unit ago" / "N unit назад"
  const relMatch = lower.match(
    /(\d+)\s*(sec|min|hour|day|week|month|year|с|мин|ч|д|нед|мес|год)/
  );
  if (relMatch && /(ago|назад)/.test(lower)) {
    const n = Number(relMatch[1]);
    const unit = relMatch[2];
    let ms = 0;
    if (/sec|^с$/.test(unit)) ms = n * 1000;
    else if (/min|мин/.test(unit)) ms = n * MIN;
    else if (/hour|^ч$/.test(unit)) ms = n * HOUR;
    else if (/day|^д$|^нед/.test(unit)) ms = /нед/.test(unit) ? n * 7 * DAY : n * DAY;
    else if (/week/.test(unit)) ms = n * 7 * DAY;
    else if (/month|мес/.test(unit)) ms = n * 30 * DAY;
    else if (/year|год/.test(unit)) ms = n * 365 * DAY;
    if (ms > 0) return new Date(now - ms).toISOString();
  }

  // "today" / "сегодня" + HH:MM
  const todayMatch = lower.match(/(?:today|сегодня)[^\d]*(\d{1,2}):(\d{2})/);
  if (todayMatch) {
    const d = new Date(now);
    d.setHours(Number(todayMatch[1]), Number(todayMatch[2]), 0, 0);
    return d.toISOString();
  }
  // "yesterday" / "вчера" + HH:MM
  const yestMatch = lower.match(/(?:yesterday|вчера)[^\d]*(\d{1,2}):(\d{2})/);
  if (yestMatch) {
    const d = new Date(now - DAY);
    d.setHours(Number(yestMatch[1]), Number(yestMatch[2]), 0, 0);
    return d.toISOString();
  }

  // Russian short months: "12 мар в 15:30"
  const ruMonths: Record<string, number> = {
    янв: 0, фев: 1, мар: 2, апр: 3, май: 4, мая: 4, июн: 5,
    июл: 6, авг: 7, сен: 8, окт: 9, ноя: 10, дек: 11,
  };
  const ruMatch = lower.match(
    /(\d{1,2})\s*(янв|фев|мар|апр|май|мая|июн|июл|авг|сен|окт|ноя|дек)[^\d]*(?:(\d{4}))?(?:[^\d]+(\d{1,2}):(\d{2}))?/
  );
  if (ruMatch) {
    const day = Number(ruMatch[1]);
    const month = ruMonths[ruMatch[2]] ?? 0;
    const year = ruMatch[3] ? Number(ruMatch[3]) : new Date(now).getFullYear();
    const hour = ruMatch[4] ? Number(ruMatch[4]) : 12;
    const minute = ruMatch[5] ? Number(ruMatch[5]) : 0;
    const d = new Date(year, month, day, hour, minute, 0, 0);
    if (d.getTime() > now + DAY) d.setFullYear(year - 1);
    return d.toISOString();
  }

  // English short months: "8 Apr", "Apr 8", "8 Apr at 10:30 PM", "Apr 8, 2025"
  const enMonths: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const enDM = lower.match(
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\w*)?(?:[^\d]+(\d{4}))?(?:[^\d]+(\d{1,2}):(\d{2})(?:\s*(am|pm))?)?/
  );
  const enMD = !enDM ? lower.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\w*)?\s+(\d{1,2})(?:,?\s+(\d{4}))?(?:[^\d]+(\d{1,2}):(\d{2})(?:\s*(am|pm))?)?/
  ) : null;
  const en = enDM
    ? { day: enDM[1], month: enDM[2], year: enDM[3], hour: enDM[4], minute: enDM[5], mer: enDM[6] }
    : enMD
      ? { month: enMD[1], day: enMD[2], year: enMD[3], hour: enMD[4], minute: enMD[5], mer: enMD[6] }
      : null;
  if (en) {
    const day = Number(en.day);
    const month = enMonths[en.month] ?? 0;
    const year = en.year ? Number(en.year) : new Date(now).getFullYear();
    let hour = en.hour ? Number(en.hour) : 12;
    const minute = en.minute ? Number(en.minute) : 0;
    if (en.mer === "pm" && hour < 12) hour += 12;
    if (en.mer === "am" && hour === 12) hour = 0;
    const d = new Date(year, month, day, hour, minute, 0, 0);
    if (d.getTime() > now + DAY) d.setFullYear(year - 1);
    return d.toISOString();
  }

  return fallback();
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
