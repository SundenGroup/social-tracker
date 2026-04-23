#!/usr/bin/env npx tsx
/**
 * Debug: find all view/play related field names in page scripts
 * Usage: npx tsx test-view-fields.ts DWeJKKNDYGE
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
    } catch {}
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

  await page.goto(`https://www.instagram.com/reel/${shortcode}/`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  const result = await page.evaluate(`
    (() => {
      const scripts = document.querySelectorAll('script:not([src])');
      const findings = [];

      for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent || "";

        const hasShortcode = text.includes("${shortcode}");
        const hasLikeCount = text.includes("like_count");
        const hasViewCount = text.includes("video_view_count");
        const hasPlayCount = text.includes("play_count");
        const hasCommentCount = text.includes("comment_count");

        if (!hasShortcode && !hasLikeCount) continue;

        // Search for ANY field containing "view", "play", "watch", "seen"
        const viewFields = [];
        const fieldPattern = /"([^"]*(?:view|play|watch|seen|impression)[^"]*)"\\s*:\\s*(\\d+)/gi;
        let match;
        while ((match = fieldPattern.exec(text)) !== null) {
          viewFields.push({ field: match[1], value: parseInt(match[2], 10) });
        }

        // Also get like_count and comment_count values
        const likeM = text.match(/"like_count"\\s*:\\s*(\\d+)/);
        const commentM = text.match(/"comment_count"\\s*:\\s*(\\d+)/);

        findings.push({
          scriptIndex: i,
          length: text.length,
          hasShortcode,
          hasLikeCount,
          hasViewCount,
          hasPlayCount,
          hasCommentCount,
          likeCount: likeM ? parseInt(likeM[1], 10) : null,
          commentCount: commentM ? parseInt(commentM[1], 10) : null,
          viewFields: viewFields.slice(0, 20),
          // Show a snippet around like_count for context
          likeCountContext: hasLikeCount ? (() => {
            const idx = text.indexOf("like_count");
            return text.slice(Math.max(0, idx - 200), idx + 200);
          })() : null,
        });
      }

      return findings;
    })()
  `);

  console.log("=== SCRIPT ANALYSIS ===");
  for (const f of result) {
    console.log("\\n--- Script", f.scriptIndex, "(" + f.length + " chars) ---");
    console.log("  hasShortcode:", f.hasShortcode);
    console.log("  hasLikeCount:", f.hasLikeCount, "->", f.likeCount);
    console.log("  hasCommentCount:", f.hasCommentCount, "->", f.commentCount);
    console.log("  hasViewCount:", f.hasViewCount);
    console.log("  hasPlayCount:", f.hasPlayCount);
    console.log("  viewFields:", JSON.stringify(f.viewFields));
    if (f.likeCountContext) {
      console.log("  context around like_count:", f.likeCountContext.slice(0, 300));
    }
  }

  await page.goto("about:blank").catch(() => {});
  if (standalone) await context.close();
}

main().catch(console.error);
