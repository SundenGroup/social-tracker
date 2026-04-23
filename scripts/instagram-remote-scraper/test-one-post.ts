#!/usr/bin/env npx tsx
/**
 * Test: scrape a single Instagram post and show what we extract.
 * Usage: npx tsx test-one-post.ts DWeJKKNDYGE
 */

import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const CDP_FILE = path.join(SCRIPT_DIR, ".browser-cdp");
const PROFILE_DIR = path.join(SCRIPT_DIR, "browser-profile");
const shortcode = process.argv[2] || "DWeJKKNDYGE";

async function main() {
  let context;
  let standalone = false;

  if (fs.existsSync(CDP_FILE)) {
    const endpoint = fs.readFileSync(CDP_FILE, "utf-8").trim();
    try {
      const browser = await chromium.connectOverCDP(endpoint);
      const contexts = browser.contexts();
      context = contexts.length > 0 ? contexts[0] : await browser.newContext();
      console.log("Connected to running browser.");
    } catch {
      console.log("Browser-server not reachable.");
    }
  }

  if (!context) {
    standalone = true;
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: "chrome",
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
      viewport: { width: 1280, height: 900 },
    });
  }

  const page = context.pages()[0] || await context.newPage();

  // Set up GraphQL interception
  let graphqlViews: number | null = null;
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/graphql") && !url.includes("/api/v1/")) return;
    try {
      const text = await response.text();
      if (text.includes("video_view_count") || text.includes("play_count")) {
        const m = text.match(/"(?:video_view_count|play_count)":\s*(\d+)/);
        if (m) {
          graphqlViews = parseInt(m[1], 10);
          console.log(`[GraphQL] Found views: ${graphqlViews}`);
        }
      }
    } catch {}
  });

  const href = `https://www.instagram.com/reel/${shortcode}/`;
  console.log(`\nLoading: ${href}\n`);
  await page.goto(href, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);

  // Run the same extraction logic as the scraper
  const postData = await page.evaluate(`
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

      let description = "";
      let publishedAt = "";
      let likes = 0;
      let comments = 0;
      let views = 0;
      let detectedType = "image";
      let source = "none";

      // --- Source 1: Embedded script data ---
      const scripts = document.querySelectorAll('script:not([src])');
      let scriptSearchResults = { total: scripts.length, withShortcode: 0, withMetrics: 0 };

      for (const script of scripts) {
        const text = script.textContent || "";

        const hasShortcode = text.includes("${shortcode}");
        const hasMetrics = text.includes("like_count") && (
          text.includes("video_view_count") || text.includes("play_count") || text.includes("comment_count")
        );

        if (hasShortcode) scriptSearchResults.withShortcode++;
        if (hasMetrics) scriptSearchResults.withMetrics++;

        if (!hasShortcode && !hasMetrics) continue;

        if (hasShortcode) {
          const shortcodeIdx = text.indexOf("${shortcode}");
          const region = text.slice(Math.max(0, shortcodeIdx - 1000), shortcodeIdx + 3000);

          const viewM = region.match(/"(?:video_view_count|play_count)":\\s*(\\d+)/);
          if (viewM) { views = parseInt(viewM[1], 10); source = "shortcode_script"; }

          const likeM = region.match(/"like_count":\\s*(\\d+)/);
          if (likeM) likes = parseInt(likeM[1], 10);

          const commentM = region.match(/"comment_count":\\s*(\\d+)/);
          if (commentM) comments = parseInt(commentM[1], 10);

          const timestampM = region.match(/"taken_at":\\s*(\\d+)/);
          if (timestampM) publishedAt = new Date(parseInt(timestampM[1], 10) * 1000).toISOString();

          if (views > 0) break;
        }

        if (hasMetrics && views === 0) {
          const viewM = text.match(/"(?:video_view_count|play_count)":\\s*(\\d+)/);
          if (viewM) { views = parseInt(viewM[1], 10); source = "metrics_script"; }

          if (likes === 0) {
            const likeM = text.match(/"like_count":\\s*(\\d+)/);
            if (likeM) likes = parseInt(likeM[1], 10);
          }

          if (comments === 0) {
            const commentM = text.match(/"comment_count":\\s*(\\d+)/);
            if (commentM) comments = parseInt(commentM[1], 10);
          }

          if (!publishedAt) {
            const timestampM = text.match(/"taken_at":\\s*(\\d+)/);
            if (timestampM) publishedAt = new Date(parseInt(timestampM[1], 10) * 1000).toISOString();
          }

          if (views > 0) break;
        }
      }

      // --- Source 2: Meta tags (fallback) ---
      if (likes === 0 && comments === 0) {
        const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
        const likeMatch = ogDesc.match(/([\\d,.KMBkmb]+)\\s*likes?/i);
        const commentMatch = ogDesc.match(/([\\d,.KMBkmb]+)\\s*comments?/i);
        if (likeMatch) likes = pc(likeMatch[1]);
        if (commentMatch) comments = pc(commentMatch[1]);
        source = source || "meta_tags";
      }

      return {
        source,
        scriptSearchResults,
        views,
        likes,
        comments,
        publishedAt,
        description: description.slice(0, 100),
      };
    })()
  `);

  console.log("=== EXTRACTION RESULT ===");
  console.log(JSON.stringify(postData, null, 2));
  console.log("GraphQL intercepted views:", graphqlViews);

  await page.goto("about:blank").catch(() => {});
  if (standalone) await context.close();
}

main().catch(console.error);
