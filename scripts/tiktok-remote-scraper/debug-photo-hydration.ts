#!/usr/bin/env npx tsx
/**
 * Debug a TikTok photo/slideshow URL to see what shape the hydration
 * JSON has. Used to diagnose why the scraper's photo extractor returns
 * null for photo posts even though it works for videos.
 */
import { chromium } from "playwright";
import * as path from "path";

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "browser-profile");

const PHOTO_URL =
  process.argv[2] ||
  "https://www.tiktok.com/@pubg.esports.official/photo/7634634139257310482";

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

  console.log("Loading photo URL:", PHOTO_URL);
  await page.goto(PHOTO_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(12000);

  // Also dump DOM-visible data and any window variables that might
  // hold the post info, in case hydration JSON is missing.
  const domSnapshot = await page.evaluate(() => {
    return {
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      likes:
        document.querySelector('[data-e2e="like-count"], [data-e2e="browse-like-count"]')
          ?.textContent?.trim() ?? null,
      comments:
        document.querySelector('[data-e2e="comment-count"], [data-e2e="browse-comment-count"]')
          ?.textContent?.trim() ?? null,
      shares:
        document.querySelector('[data-e2e="share-count"], [data-e2e="browse-share-count"]')
          ?.textContent?.trim() ?? null,
      views:
        document.querySelector('[data-e2e="video-views"], [data-e2e="browse-video-views"]')
          ?.textContent?.trim() ?? null,
      desc:
        document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]')
          ?.textContent?.trim() ?? null,
      imgs: Array.from(document.querySelectorAll("img"))
        .slice(0, 5)
        .map(function (img) {
          return {
            src: (img.getAttribute("src") || "").slice(0, 100),
            alt: (img.getAttribute("alt") || "").slice(0, 80),
          };
        }),
      time: document.querySelector("time")?.textContent?.trim() ?? null,
      bodyTextSnippet: document.body.innerText.slice(0, 600),
    };
  });
  console.log("\n=== DOM snapshot ===");
  console.log(JSON.stringify(domSnapshot, null, 2));

  const result = await page.evaluate(() => {
    const el = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
    if (!el || !el.textContent) return { source: "no-hydration", currentUrl: location.href };
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(el.textContent);
    } catch (e) {
      return { source: "parse-error", err: String(e) };
    }
    const scope = (data["__DEFAULT_SCOPE__"] || {}) as Record<string, unknown>;
    const scopeKeys = Object.keys(scope);

    const out: Record<string, unknown> = {
      source: "hydration",
      currentUrl: location.href,
      scopeKeys,
    };

    // Try every plausible scope name
    for (const key of scopeKeys) {
      if (key.includes("detail") || key.includes("photo") || key.includes("post") || key.includes("video")) {
        const sub = scope[key] as Record<string, unknown> | undefined;
        if (sub && typeof sub === "object") {
          const subKeys = Object.keys(sub);
          out[`scope.${key}.keys`] = subKeys;
          // Look for itemStruct
          const ii = (sub.itemInfo as Record<string, unknown> | undefined)?.itemStruct as
            | Record<string, unknown>
            | undefined;
          if (ii) {
            out[`scope.${key}.itemStruct.keys`] = Object.keys(ii).slice(0, 30);
            out[`scope.${key}.itemStruct.id`] = ii.id;
            out[`scope.${key}.itemStruct.desc`] = String(ii.desc ?? "").slice(0, 80);
            out[`scope.${key}.itemStruct.stats`] = ii.stats;
            out[`scope.${key}.itemStruct.imagePost.keys`] = ii.imagePost
              ? Object.keys(ii.imagePost as Record<string, unknown>)
              : null;
            const imageList =
              (ii.imagePost as Record<string, unknown> | undefined)?.images;
            out[`scope.${key}.itemStruct.imagePost.images.length`] = Array.isArray(imageList)
              ? imageList.length
              : null;
            if (Array.isArray(imageList) && imageList.length > 0) {
              out[`scope.${key}.itemStruct.imagePost.images[0].keys`] = Object.keys(
                imageList[0] as Record<string, unknown>
              );
              out[`scope.${key}.itemStruct.imagePost.images[0].imageURL`] = (
                imageList[0] as { imageURL?: unknown }
              ).imageURL;
            }
          }
        }
      }
    }
    return out;
  });

  console.log("\n=== RESULT ===");
  console.log(JSON.stringify(result, null, 2));

  await ctx.close();
}

main().catch((e) => {
  console.error("[Debug] Fatal:", e);
  process.exit(1);
});
