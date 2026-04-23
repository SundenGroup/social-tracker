import { chromium } from "playwright";
import * as path from "path";

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "browser-profile");

async function main() {
  const ctx = await chromium.launchPersistentContext(DIR, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 900 },
  });

  const page = ctx.pages()[0] || await ctx.newPage();

  // Visit a single video page and see what data is available
  const testUrl = "https://www.tiktok.com/@pubg.esports.official";
  console.log("Loading profile to find a video...");
  await page.goto(testUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(6000);

  // Get first video URL
  const firstVideoUrl = await page.$eval('a[href*="/video/"]', (el) => el.getAttribute("href"));
  if (!firstVideoUrl) {
    console.log("No video found on profile page");
    await ctx.close();
    return;
  }

  const fullUrl = firstVideoUrl.startsWith("http") ? firstVideoUrl : "https://www.tiktok.com" + firstVideoUrl;
  console.log("\nVisiting video:", fullUrl);
  await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  // Check hydration data on video page
  const hydration = await page.evaluate(() => {
    const el = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
    if (!el || !el.textContent) return "NO HYDRATION";
    const data = JSON.parse(el.textContent);
    const scope = data["__DEFAULT_SCOPE__"];
    const scopeKeys = scope ? Object.keys(scope) : [];

    // Look for video detail
    const videoDetail = scope?.["webapp.video-detail"];
    if (videoDetail) {
      const vdKeys = Object.keys(videoDetail);
      const itemInfo = videoDetail.itemInfo?.itemStruct;
      if (itemInfo) {
        return {
          source: "hydration",
          scopeKeys,
          vdKeys,
          id: itemInfo.id,
          desc: String(itemInfo.desc || "").slice(0, 100),
          createTime: itemInfo.createTime,
          stats: itemInfo.stats,
          itemKeys: Object.keys(itemInfo).slice(0, 20),
        };
      }
      return { source: "hydration", scopeKeys, vdKeys, note: "no itemStruct" };
    }

    return { source: "hydration", scopeKeys, note: "no webapp.video-detail" };
  });

  console.log("\n=== Video page hydration ===");
  console.log(JSON.stringify(hydration, null, 2));

  // Also check what's visible in the DOM
  const domData = await page.evaluate(() => {
    const desc = document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"], h1, [class*="DivVideoInfoContainer"] span')?.textContent;
    const date = document.querySelector('[data-e2e="browser-nickname"] + span, time, [class*="SpanOtherInfos"] span')?.textContent;
    const likes = document.querySelector('[data-e2e="like-count"], [data-e2e="browse-like-count"]')?.textContent;
    const comments = document.querySelector('[data-e2e="comment-count"], [data-e2e="browse-comment-count"]')?.textContent;
    const shares = document.querySelector('[data-e2e="share-count"], [data-e2e="browse-share-count"]')?.textContent;
    const views = document.querySelector('[data-e2e="video-views"], [data-e2e="browse-video-views"]')?.textContent;
    return { desc: desc?.slice(0, 100), date, likes, comments, shares, views };
  });

  console.log("\n=== Video page DOM data ===");
  console.log(JSON.stringify(domData, null, 2));

  await ctx.close();
}

main().catch(console.error);
