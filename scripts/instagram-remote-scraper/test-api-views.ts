#!/usr/bin/env npx tsx
/**
 * Test: fetch view counts via Instagram's private API from logged-in browser.
 * Usage: npx tsx test-api-views.ts DWeJKKNDYGE
 */

import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const CDP_FILE = path.join(SCRIPT_DIR, ".browser-cdp");
const PROFILE_DIR = path.join(SCRIPT_DIR, "browser-profile");
const shortcode = process.argv[2] || "DWeJKKNDYGE";

function shortcodeToMediaId(code: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = BigInt(0);
  for (const char of code) {
    id = id * 64n + BigInt(alphabet.indexOf(char));
  }
  return id.toString();
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
  const mediaId = shortcodeToMediaId(shortcode);
  console.log(`Shortcode: ${shortcode} -> Media ID: ${mediaId}`);

  // Navigate to Instagram so cookies are sent
  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  const url = `https://www.instagram.com/api/v1/media/${mediaId}/info/`;
  console.log(`\nFetching: ${url}\n`);

  const result = await page.evaluate(`
    fetch("${url}", {
      headers: {
        "X-IG-App-ID": "936619743392459",
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
    })
    .then(r => r.text())
    .then(text => {
      // Search for view/play/like fields in the raw text
      const fields = {};
      const patterns = [
        ["play_count", /"play_count":\\s*(\\d+)/],
        ["video_view_count", /"video_view_count":\\s*(\\d+)/],
        ["view_count", /"view_count":\\s*(\\d+)/],
        ["like_count", /"like_count":\\s*(\\d+)/],
        ["comment_count", /"comment_count":\\s*(\\d+)/],
        ["share_count", /"share_count":\\s*(\\d+)/],
        ["reshare_count", /"reshare_count":\\s*(\\d+)/],
        ["save_count", /"save_count":\\s*(\\d+)/],
        ["ig_play_count", /"ig_play_count":\\s*(\\d+)/],
        ["fb_play_count", /"fb_play_count":\\s*(\\d+)/],
        ["total_plays", /"total_plays":\\s*(\\d+)/],
        ["media_type", /"media_type":\\s*(\\d+)/],
        ["taken_at", /"taken_at":\\s*(\\d+)/],
      ];
      for (const [name, pattern] of patterns) {
        const m = text.match(pattern);
        if (m) fields[name] = parseInt(m[1], 10);
      }

      // Also get caption
      const captionM = text.match(/"text":\\s*"((?:[^"\\\\\\\\]|\\\\\\\\.)*)"/);

      return {
        ok: true,
        length: text.length,
        fields,
        caption: captionM ? captionM[1].slice(0, 100) : null,
        hasItems: text.includes('"items"'),
      };
    })
    .catch(err => ({ ok: false, error: err.message }))
  `);

  console.log("=== RESULT ===");
  console.log(JSON.stringify(result, null, 2));

  await page.goto("about:blank").catch(() => {});
  if (standalone) await context.close();
}

main().catch(console.error);
