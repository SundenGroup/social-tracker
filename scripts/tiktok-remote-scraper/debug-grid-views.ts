#!/usr/bin/env npx tsx
/**
 * Debug: dump profile-grid HTML around a couple of post tiles to find
 * where TikTok renders the view count. We want to harvest views from
 * the grid (same as the IG scraper does for reels) so photo posts —
 * which don't expose play counts on their detail page — still get a
 * views metric.
 */
import { chromium } from "playwright";
import * as path from "path";

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "browser-profile");
const PROFILE_URL =
  process.argv[2] || "https://www.tiktok.com/@pubg.esports.official";

async function main() {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(DIR, {
      channel: "chrome",
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    });
  } catch {
    ctx = await chromium.launchPersistentContext(DIR, {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    });
  }
  const page = ctx.pages()[0] || (await ctx.newPage());

  console.log("Loading profile:", PROFILE_URL);
  await page.goto(PROFILE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(8000);

  // Scroll a bit to load some posts
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(1500);
  }

  const dump = await page.evaluate(`
    (() => {
      const anchors = Array.from(
        document.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]')
      );
      const out = { totalAnchors: anchors.length, samples: [] };
      let videoSamples = 0;
      let photoSamples = 0;
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        const href = a.getAttribute("href") || "";
        const isPhoto = href.indexOf("/photo/") >= 0;
        const isVideo = href.indexOf("/video/") >= 0;
        let take = false;
        if (isPhoto && photoSamples < 2) { photoSamples++; take = true; }
        else if (isVideo && videoSamples < 5) { videoSamples++; take = true; }
        if (!take) continue;
        out.samples.push({
          href,
          type: isPhoto ? "photo" : "video",
          text: (a.textContent || "").slice(0, 300),
          html: ((a.parentElement && a.parentElement.parentElement) || a.parentElement || a).outerHTML.slice(0, 2000),
        });
        if (videoSamples >= 5 && photoSamples >= 2) break;
      }
      return out;
    })()
  `);

  console.log("\n=== GRID TILE DUMPS ===");
  console.log("Total anchors found:", (dump as { totalAnchors: number }).totalAnchors);
  for (const tile of (dump as { samples: Array<{ href: string; type: string; text: string; html: string }> }).samples) {
    console.log(`\n--- ${tile.type} tile: ${tile.href} ---`);
    console.log(`text: ${tile.text}`);
    console.log(`html: ${tile.html}`);
  }

  await ctx.close();
}

main().catch((e) => {
  console.error("[Debug] Fatal:", e);
  process.exit(1);
});
