#!/usr/bin/env npx tsx
/**
 * Debug: Check what posts the scraper sees on a profile page.
 * Usage: npx tsx debug-profile.ts pubgesports
 */

import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const CDP_FILE = path.join(SCRIPT_DIR, ".browser-cdp");
const PROFILE_DIR = path.join(SCRIPT_DIR, "browser-profile");
const username = process.argv[2] || "pubgesports";

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

  const tabs = [
    { url: `https://www.instagram.com/${username}/`, label: "Posts" },
    { url: `https://www.instagram.com/${username}/reels/`, label: "Reels" },
  ];

  for (const tab of tabs) {
    console.log(`\n=== ${tab.label} tab: ${tab.url} ===`);
    await page.goto(tab.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);

    // Screenshot
    await page.screenshot({ path: path.join(SCRIPT_DIR, `debug-${tab.label.toLowerCase()}-${username}.png`) });
    console.log(`Screenshot saved: debug-${tab.label.toLowerCase()}-${username}.png`);

    // Check current URL (did it redirect?)
    console.log(`Current URL: ${page.url()}`);

    // Count post links before scrolling
    const initialLinks = await page.$$eval(
      'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
      (els) => {
        const posts: string[] = [];
        els.forEach((e) => {
          const href = e.getAttribute("href") || "";
          const m = href.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
          if (m) posts.push(`${m[1]}/${m[2]}`);
        });
        return posts;
      }
    );
    console.log(`Initial links found: ${initialLinks.length}`);
    console.log(`First 10:`, initialLinks.slice(0, 10));

    // Scroll a bit
    for (let i = 0; i < 3; i++) {
      await page.evaluate("window.scrollBy(0, window.innerHeight * 2)");
      await page.waitForTimeout(2000);
    }

    const afterScrollLinks = await page.$$eval(
      'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
      (els) => {
        const posts: string[] = [];
        const seen = new Set<string>();
        els.forEach((e) => {
          const href = e.getAttribute("href") || "";
          const m = href.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
          if (m && !seen.has(m[2])) {
            seen.add(m[2]);
            posts.push(`${m[1]}/${m[2]}`);
          }
        });
        return posts;
      }
    );
    console.log(`After scroll: ${afterScrollLinks.length} unique links`);
    console.log(`First 15:`, afterScrollLinks.slice(0, 15));
  }

  await page.goto("about:blank").catch(() => {});
  if (standalone) await context.close();
}

main().catch(console.error);
