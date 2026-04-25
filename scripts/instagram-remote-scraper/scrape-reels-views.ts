#!/usr/bin/env npx tsx
/**
 * Proof-of-concept: scrape the Reels grid page for view counts.
 *
 * Instagram's /<username>/reels/ page shows every reel as a thumbnail
 * with a small overlay containing two numbers (a view count and a
 * like count). The overlay is only rendered for LOGGED-IN viewers —
 * which is why our previous extraction (running on a logged-out / under-
 * authenticated session) was getting 0 for views.
 *
 * Usage:
 *   1. Start the persistent browser & log in once if you haven't:
 *        npm run browser
 *      (then in the Chrome window: log into Instagram)
 *   2. Run this:
 *        npx tsx scrape-reels-views.ts pubgesports_kr
 *
 * Output:
 *   - prints {shortcode, [num1, num2]} for every reel found
 *   - writes debug-reels-<username>.json with the same data
 *
 * Once we eyeball one row and confirm which of num1/num2 is views vs
 * likes, this becomes the basis for integrating views back into the
 * main scraper.
 */
import { chromium, type Browser, type BrowserContext } from "playwright";
import * as fs from "fs";
import * as path from "path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const CDP_FILE = path.join(SCRIPT_DIR, ".browser-cdp");
const PROFILE_DIR = path.join(SCRIPT_DIR, "browser-profile");

const username = process.argv[2];
if (!username) {
  console.error("Usage: npx tsx scrape-reels-views.ts <username>");
  process.exit(1);
}

async function connect(): Promise<{ browser: Browser | null; context: BrowserContext; standalone: boolean }> {
  if (fs.existsSync(CDP_FILE)) {
    const endpoint = fs.readFileSync(CDP_FILE, "utf-8").trim();
    try {
      const browser = await chromium.connectOverCDP(endpoint);
      const contexts = browser.contexts();
      const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
      console.log("[Reels] Connected to running browser-server.");
      return { browser, context, standalone: false };
    } catch {
      console.log("[Reels] Browser-server not reachable, launching standalone...");
    }
  } else {
    console.log("[Reels] No browser-server, launching standalone with persistent profile...");
  }
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  }).catch(async () =>
    chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    })
  );
  return { browser: null, context, standalone: true };
}

async function main() {
  const { browser, context, standalone } = await connect();
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  // Warm up so cookies are live
  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  const url = `https://www.instagram.com/${username}/reels/`;
  console.log(`[Reels] Loading ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);

  // Scroll a bit to load more reels (lazy-loaded). 8 scrolls covers
  // ~80-150 reels which is plenty for confirming the approach works.
  console.log("[Reels] Scrolling to load reels...");
  for (let i = 0; i < 8; i++) {
    await page.evaluate("window.scrollBy(0, window.innerHeight * 1.5)");
    await page.waitForTimeout(1200 + Math.random() * 800);
  }
  await page.evaluate("window.scrollTo(0, 0)");
  await page.waitForTimeout(800);

  // Extract views via SVG aria-label="View count icon" — the only
  // reliable selector for the grid's view counter (confirmed by user
  // DOM inspection on /pubgesports/reels/, post DXiaXRuiKuQ = 3,081 views).
  const reels = await page.evaluate(`
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

      const results = [];
      const anchors = document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]');
      const seen = new Set();
      for (const a of Array.from(anchors)) {
        const href = a.getAttribute("href") || "";
        const m = href.match(/\\/(reel|p|tv)\\/([A-Za-z0-9_-]+)/);
        if (!m) continue;
        const shortcode = m[2];
        if (seen.has(shortcode)) continue;
        seen.add(shortcode);

        // ===== Views: walk from each "View count icon" SVG up to a
        // small ancestor whose textContent contains the number =====
        let views = 0;
        const viewSvgs = a.querySelectorAll('svg[aria-label="View count icon"]');
        for (const svg of Array.from(viewSvgs)) {
          // Try walking up to several levels; pick the first ancestor
          // (within the anchor) whose textContent has a number.
          let cur = svg.parentElement;
          for (let hop = 0; hop < 5 && cur && cur !== a; hop++) {
            const text = cur.textContent || "";
            const numMatch = text.match(/[\\d.,]+\\s*[KkMmBb]?/);
            if (numMatch) {
              const n = parseCount(numMatch[0]);
              if (n > 0) { views = n; break; }
            }
            cur = cur.parentElement;
          }
          if (views > 0) break;
        }

        // Debug context: collect all bare numbers + relevant aria-labels
        const numbers = [];
        const ariaLabels = [];
        const allSpans = a.querySelectorAll("span");
        for (const sp of Array.from(allSpans)) {
          const text = (sp.textContent || "").trim();
          if (text && /^[\\d.,]+\\s*[KkMmBb]?$/.test(text)) numbers.push(text);
        }
        const descs = a.querySelectorAll("[aria-label]");
        for (const d of Array.from(descs)) {
          const aria = d.getAttribute("aria-label") || "";
          if (/(view|play|like|comment)/i.test(aria)) ariaLabels.push(aria);
        }

        results.push({ shortcode, href, views, numbers, ariaLabels: Array.from(new Set(ariaLabels)) });
      }
      return results;
    })()
  `) as Array<{ shortcode: string; href: string; views: number; numbers: string[]; ariaLabels: string[] }>;

  console.log(`\n[Reels] Found ${reels.length} reel/post links\n`);

  // Print first 12 — primary column is `views` (extracted via SVG aria-label),
  // followed by any other bare numbers spotted in the thumbnail (for cross-check).
  for (const r of reels.slice(0, 12)) {
    const otherNums = r.numbers.filter((n) => n !== String(r.views) && n !== r.views.toLocaleString()).slice(0, 3);
    const nums = otherNums.length > 0 ? `   other=[${otherNums.join(", ")}]` : "";
    const aria = r.ariaLabels.length > 0 ? `   aria=[${r.ariaLabels.join(" | ")}]` : "";
    console.log(`  ${r.shortcode}  views=${r.views}${nums}${aria}`);
  }
  if (reels.length > 12) console.log(`  ... and ${reels.length - 12} more`);
  const withViews = reels.filter((r) => r.views > 0).length;
  console.log(`\n[Reels] ${withViews}/${reels.length} thumbnails yielded a non-zero view count`);

  // Save full data
  const outPath = path.join(SCRIPT_DIR, `debug-reels-${username}.json`);
  fs.writeFileSync(outPath, JSON.stringify(reels, null, 2));
  console.log(`\n[Reels] Wrote ${outPath}`);

  // Take a screenshot
  const shotPath = path.join(SCRIPT_DIR, `debug-reels-${username}.png`);
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log(`[Reels] Screenshot: ${shotPath}`);

  if (standalone && !browser) {
    try { await context.close(); } catch { /* ignore */ }
  } else if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error("[Reels] Fatal:", err);
  process.exit(1);
});
