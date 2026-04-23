#!/usr/bin/env npx tsx
/**
 * Debug script: visit a single Instagram post and dump all available data sources
 * to find where view counts live.
 *
 * Usage: npx tsx debug-post.ts <shortcode>
 * Example: npx tsx debug-post.ts DWcNgD-jh-w
 */

import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const CDP_FILE = path.join(SCRIPT_DIR, ".browser-cdp");
const PROFILE_DIR = path.join(SCRIPT_DIR, "browser-profile");

const shortcode = process.argv[2];
if (!shortcode) {
  console.error("Usage: npx tsx debug-post.ts <shortcode>");
  process.exit(1);
}

async function main() {
  let context;
  let standalone = false;

  if (fs.existsSync(CDP_FILE)) {
    const endpoint = fs.readFileSync(CDP_FILE, "utf-8").trim();
    try {
      const browser = await chromium.connectOverCDP(endpoint);
      const contexts = browser.contexts();
      context = contexts.length > 0 ? contexts[0] : await browser.newContext();
    } catch {
      console.log("Browser-server not reachable, launching standalone...");
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

  // Intercept network responses to capture API data
  const apiResponses: { url: string; body: string }[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (
      url.includes("/graphql") ||
      url.includes("/api/v1/") ||
      url.includes("__a=1")
    ) {
      try {
        const body = await response.text();
        apiResponses.push({ url, body: body.slice(0, 5000) });
      } catch {}
    }
  });

  const postUrl = `https://www.instagram.com/p/${shortcode}/`;
  console.log(`\nLoading: ${postUrl}\n`);
  await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  // 1. Dump meta tags
  console.log("=== META TAGS ===");
  const metas = await page.evaluate(`
    (() => {
      const result = {};
      document.querySelectorAll('meta[property], meta[name]').forEach((el) => {
        const key = el.getAttribute('property') || el.getAttribute('name');
        result[key] = el.getAttribute('content');
      });
      return result;
    })()
  `);
  for (const [key, value] of Object.entries(metas as Record<string, string>)) {
    if (key.startsWith("og:") || key === "description") {
      console.log(`  ${key}: ${value}`);
    }
  }

  // 2. Check for embedded JSON data
  console.log("\n=== EMBEDDED JSON ===");
  const jsonScripts = await page.evaluate(`
    (() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      return Array.from(scripts).map((s) => s.textContent);
    })()
  `);
  for (const json of jsonScripts as string[]) {
    console.log("  ld+json:", json?.slice(0, 500));
  }

  // 3. Check for __additionalData or similar hydration
  const hydrationData = await page.evaluate(`
    (() => {
      const keys = ['__additionalData', '_sharedData', '__NEXT_DATA__'];
      const found = {};
      for (const key of keys) {
        if (window[key]) found[key] = JSON.stringify(window[key]).slice(0, 1000);
      }
      // Also check for any script tags with interesting content
      const scripts = document.querySelectorAll('script:not([src])');
      for (const s of scripts) {
        const text = s.textContent || '';
        if (text.includes('video_view_count') || text.includes('play_count') || text.includes('view_count')) {
          found['script_with_views'] = text.slice(0, 2000);
        }
      }
      return found;
    })()
  `);
  for (const [key, value] of Object.entries(hydrationData as Record<string, string>)) {
    console.log(`  ${key}: ${value?.slice(0, 500)}`);
  }

  // 4. Look for view count elements in DOM
  console.log("\n=== VIEW COUNT ELEMENTS ===");
  const viewElements = await page.evaluate(`
    (() => {
      const results = [];
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        const text = (span.textContent || '').trim();
        if (/views?|plays?|watch/i.test(text) && text.length < 50) {
          results.push({ text, className: span.className?.slice(0, 50) });
        }
      }
      // Also check aria-labels
      const allEls = document.querySelectorAll('[aria-label]');
      for (const el of allEls) {
        const label = el.getAttribute('aria-label') || '';
        if (/views?|plays?|like|comment/i.test(label)) {
          results.push({ ariaLabel: label, tag: el.tagName });
        }
      }
      return results;
    })()
  `);
  for (const el of viewElements as any[]) {
    console.log("  ", JSON.stringify(el));
  }

  // 5. Dump intercepted API responses
  console.log("\n=== INTERCEPTED API RESPONSES ===");
  for (const resp of apiResponses) {
    console.log(`  URL: ${resp.url.slice(0, 150)}`);
    // Look for view-related fields
    if (resp.body.includes("video_view_count") || resp.body.includes("play_count") || resp.body.includes("view_count")) {
      console.log("  >>> CONTAINS VIEW DATA!");
      // Try to extract just the relevant part
      const viewMatch = resp.body.match(/"(?:video_view_count|play_count|view_count)":\s*(\d+)/);
      if (viewMatch) {
        console.log(`  >>> View count: ${viewMatch[1]}`);
      }
    }
    console.log(`  Body preview: ${resp.body.slice(0, 300)}`);
    console.log();
  }

  // 6. Try the embed endpoint
  console.log("=== EMBED ENDPOINT ===");
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
  await page.goto(embedUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(3000);

  const embedData = await page.evaluate(`
    (() => {
      const results = {};
      // Check for view counts in embed
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        const text = (span.textContent || '').trim();
        if (/views?|plays?|likes?|comments?/i.test(text) && text.length < 50) {
          results[text] = span.className?.slice(0, 30);
        }
      }
      // Check for embedded JSON in embed page
      const scripts = document.querySelectorAll('script:not([src])');
      for (const s of scripts) {
        const text = s.textContent || '';
        if (text.includes('video_view_count') || text.includes('view_count')) {
          const m = text.match(/"(?:video_view_count|play_count|view_count)":\s*(\d+)/);
          if (m) results['view_count_from_script'] = m[1];
        }
        if (text.includes('like_count')) {
          const m = text.match(/"like_count":\s*(\d+)/);
          if (m) results['like_count_from_script'] = m[1];
        }
        if (text.includes('comment_count')) {
          const m = text.match(/"comment_count":\s*(\d+)/);
          if (m) results['comment_count_from_script'] = m[1];
        }
      }
      return results;
    })()
  `);
  console.log("  Embed data:", JSON.stringify(embedData, null, 2));

  await page.goto("about:blank").catch(() => {});
  if (standalone) await context.close();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
