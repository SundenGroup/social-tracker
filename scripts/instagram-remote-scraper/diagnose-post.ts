#!/usr/bin/env npx tsx
/**
 * Instagram post-page diagnostic.
 *
 * Connects to your existing browser session (same way scrape.ts /
 * backfill-details.ts do) and dumps everything Instagram serves for
 * a single post: all JSON-LD blocks, all og: meta tags, the whole
 * <head>, page title, login-wall detection, etc.
 *
 * The goal is to see EXACTLY what extraction surfaces are present so
 * we can fix the parser. Drops two files in the script dir:
 *   - debug-post-<shortcode>.html  (full HTML, capped at 1MB)
 *   - debug-post-<shortcode>.json  (parsed extraction summary)
 *
 * Usage:
 *   npx tsx diagnose-post.ts <shortcode>
 *   npx tsx diagnose-post.ts DXilv2YPw6k
 *
 * Or pass a full URL:
 *   npx tsx diagnose-post.ts https://www.instagram.com/p/DXilv2YPw6k/
 */
import { chromium, type Browser, type BrowserContext } from "playwright";
import * as fs from "fs";
import * as path from "path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const CDP_FILE = path.join(SCRIPT_DIR, ".browser-cdp");
const PROFILE_DIR = path.join(SCRIPT_DIR, "browser-profile");

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: npx tsx diagnose-post.ts <shortcode | full URL>");
  process.exit(1);
}

const shortcode = arg.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/)?.[2] ?? arg;
const url = arg.startsWith("http") ? arg : `https://www.instagram.com/p/${shortcode}/`;

async function connect(): Promise<{ browser: Browser | null; context: BrowserContext; standalone: boolean }> {
  if (fs.existsSync(CDP_FILE)) {
    const endpoint = fs.readFileSync(CDP_FILE, "utf-8").trim();
    try {
      const browser = await chromium.connectOverCDP(endpoint);
      const contexts = browser.contexts();
      const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
      console.log("[Diag] Connected to running browser-server.");
      return { browser, context, standalone: false };
    } catch {
      console.log("[Diag] Browser-server not reachable, launching standalone...");
    }
  } else {
    console.log("[Diag] No browser-server, launching standalone with persistent profile...");
  }
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  }).catch(async () =>
    chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    })
  );
  return { browser: null, context, standalone: true };
}

async function main() {
  console.log(`[Diag] Inspecting ${url}`);
  const { browser, context, standalone } = await connect();

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  // Warm up on home so cookies/session are live
  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Visit target
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3500);

  const dump = await page.evaluate(`
    (() => {
      // Login-wall heuristics
      const html = document.documentElement.outerHTML || "";
      const hasLoginButton = !!document.querySelector('button[type="submit"]');
      const hasLoginText = /Log in|Sign up|See more on Instagram|Anmelden|Iniciar sesión|Войти/i.test(document.body?.innerText || "");
      const isMainPostPage = /\\/p\\/|\\/reel\\/|\\/tv\\//.test(location.pathname);
      const wasRedirected = location.href !== ${JSON.stringify(url)};

      // All JSON-LD blocks
      const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      const ldBlocks = ldScripts.map((s, i) => {
        let parsed = null;
        let parseError = null;
        try { parsed = JSON.parse(s.textContent || "{}"); } catch (e) { parseError = String(e); }
        return {
          index: i,
          rawLength: (s.textContent || "").length,
          parseError,
          parsed,
        };
      });

      // og: meta tags
      const ogTags = {};
      for (const m of Array.from(document.querySelectorAll('meta[property^="og:"], meta[name^="og:"]'))) {
        const k = m.getAttribute("property") || m.getAttribute("name");
        if (k) ogTags[k] = m.getAttribute("content") || "";
      }

      // Other interesting meta
      const otherMeta = {};
      for (const m of Array.from(document.querySelectorAll('meta[name="description"], meta[name="twitter:description"], meta[property="instapp:owner_user_id"]'))) {
        const k = m.getAttribute("property") || m.getAttribute("name");
        if (k) otherMeta[k] = m.getAttribute("content") || "";
      }

      // Time element (publish date)
      const timeEls = Array.from(document.querySelectorAll("time")).map((t) => ({
        datetime: t.getAttribute("datetime"),
        title: t.getAttribute("title"),
        text: t.textContent || "",
      }));

      // First few <article> texts (might contain caption)
      const articleSnippets = Array.from(document.querySelectorAll("article")).slice(0, 2).map((a) => (a.textContent || "").slice(0, 500));

      return {
        finalUrl: location.href,
        wasRedirected,
        pageTitle: document.title,
        htmlLength: html.length,
        ldScriptCount: ldScripts.length,
        ldBlocks,
        ogTags,
        otherMeta,
        timeEls,
        articleSnippets,
        hasLoginButton,
        hasLoginText,
        isMainPostPage,
        // First 2KB of body for reference
        bodySnippet: (document.body?.innerText || "").slice(0, 2000),
      };
    })()
  `);

  // Save full HTML
  const fullHtml = await page.content();
  const htmlPath = path.join(SCRIPT_DIR, `debug-post-${shortcode}.html`);
  fs.writeFileSync(htmlPath, fullHtml.slice(0, 1024 * 1024));
  console.log(`[Diag] Wrote ${htmlPath} (${Math.round(Math.min(fullHtml.length, 1024 * 1024) / 1024)} KB)`);

  // Save extraction summary
  const jsonPath = path.join(SCRIPT_DIR, `debug-post-${shortcode}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(dump, null, 2));
  console.log(`[Diag] Wrote ${jsonPath}`);

  // Print quick summary
  console.log("\n========== SUMMARY ==========");
  console.log(`Final URL: ${dump.finalUrl}`);
  console.log(`Redirected? ${dump.wasRedirected}`);
  console.log(`Page title: ${dump.pageTitle}`);
  console.log(`HTML length: ${dump.htmlLength.toLocaleString()} chars`);
  console.log(`Login button visible? ${dump.hasLoginButton}`);
  console.log(`Login text on page? ${dump.hasLoginText}`);
  console.log(`<script type="application/ld+json"> blocks: ${dump.ldScriptCount}`);
  for (const b of dump.ldBlocks) {
    if (b.parseError) {
      console.log(`  [ld ${b.index}] PARSE ERROR: ${b.parseError}`);
    } else {
      const types = (() => {
        const collect = (n: unknown): string[] => {
          if (!n || typeof n !== "object") return [];
          const obj = n as Record<string, unknown>;
          const t = obj["@type"];
          const out: string[] = [];
          if (typeof t === "string") out.push(t);
          if (Array.isArray(obj["@graph"])) for (const g of obj["@graph"]) out.push(...collect(g));
          return out;
        };
        return collect(b.parsed);
      })();
      console.log(`  [ld ${b.index}] @type: [${types.join(", ")}]`);
    }
  }
  console.log("\nog: tags:");
  for (const [k, v] of Object.entries(dump.ogTags)) {
    const sval = String(v);
    console.log(`  ${k} = ${sval.length > 200 ? sval.slice(0, 200) + "..." : sval}`);
  }
  console.log("\nFirst <time> elements:", JSON.stringify(dump.timeEls.slice(0, 3)));
  console.log("\nFirst 200 chars of body text:", dump.bodySnippet.slice(0, 200));
  console.log("=============================");

  if (standalone && !browser) {
    try { await context.close(); } catch { /* ignore */ }
  } else if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error("[Diag] Fatal:", err);
  process.exit(1);
});
