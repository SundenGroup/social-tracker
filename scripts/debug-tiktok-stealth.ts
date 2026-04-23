import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { parseCookieData, loadCookiesIntoContext } from "../lib/utils/browser-cookies";

const prisma = new PrismaClient();

async function main() {
  const account = await prisma.socialAccount.findFirst({ where: { platform: "tiktok" } });
  if (!account || !account.authToken) throw new Error("No TikTok account");
  const cookieData = parseCookieData(account.authToken);

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "Europe/Stockholm",
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  await loadCookiesIntoContext(context, cookieData);
  const page = await context.newPage();

  // Go to homepage first to warm cookies
  await page.goto("https://www.tiktok.com/foryou", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(4000);

  // Navigate to profile
  await page.goto("https://www.tiktok.com/@pubg.esports.official", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(6000);

  await page.screenshot({ path: "/tmp/tiktok-stealth.png" });

  const hasCaptcha = await page.evaluate(() => {
    return (
      document.body.innerText.includes("slider") ||
      document.body.innerText.includes("puzzle") ||
      document.body.innerText.includes("Verify")
    );
  });
  console.log("Has captcha:", hasCaptcha);

  const videoCount = await page.evaluate(() => {
    return document.querySelectorAll('a[href*="/video/"]').length;
  });
  console.log("Video links in DOM:", videoCount);

  const hydration = await page.evaluate(() => {
    const el = document.querySelector("#__UNIVERSAL_DATA_FOR_REHYDRATION__");
    if (!el || !el.textContent) return null;
    const data = JSON.parse(el.textContent);
    const userDetail = data?.__DEFAULT_SCOPE__?.["webapp.user-detail"];
    const items = userDetail?.userInfo?.itemList;
    return {
      itemCount: Array.isArray(items) ? items.length : 0,
      videoCount: userDetail?.userInfo?.stats?.videoCount ?? 0,
    };
  });
  console.log("Hydration:", hydration);

  await browser.close();
  await prisma.$disconnect();
}

main().catch(console.error);
