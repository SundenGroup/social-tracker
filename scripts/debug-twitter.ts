import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  const page = await context.newPage();

  console.log("Navigating to @pubgesports...");
  await page.goto("https://x.com/pubgesports", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Try to accept cookie consent
  const acceptBtn = await page.$('text="Accept all cookies"');
  if (acceptBtn) {
    console.log("Clicking 'Accept all cookies'...");
    await acceptBtn.click();
    await page.waitForTimeout(3000);
  }

  // Try to dismiss login prompt by clicking elsewhere or scrolling
  await page.waitForTimeout(5000);

  await page.screenshot({ path: "/tmp/x-debug2.png", fullPage: false });
  console.log("Screenshot saved to /tmp/x-debug2.png");

  const tweets = await page.$$('article[data-testid="tweet"]');
  console.log(`Found ${tweets.length} tweet articles in DOM`);

  // Check what's in the page
  const title = await page.title();
  console.log(`Page title: ${title}`);

  // Look for any timeline content
  const cells = await page.$$('[data-testid="cellInnerDiv"]');
  console.log(`Found ${cells.length} cellInnerDiv elements`);

  await browser.close();
}

main().catch(console.error);
