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
import { EXTRACT_POST_PAGE_JS, type PostPageExtraction } from "./extract-post-page";

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

  // Always open a fresh tab. Reusing the browser-server's first page
  // can fail if the user has been clicking around / closing tabs;
  // a brand-new page is reliable.
  const page = await context.newPage();

  // Warm up on home so cookies/session are live
  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Visit target — wait LONG enough for IG's React app to hydrate and
  // pull the GraphQL data that backs the rendered view-count text.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(7000);

  // Save a screenshot so we can see exactly where view count appears.
  const screenshotPath = path.join(SCRIPT_DIR, `debug-post-${shortcode}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[Diag] Screenshot: ${screenshotPath}`);

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

      // ===== Hunt for the view count in the rendered DOM =====
      // The user can see "X plays" / "X views" on the page, so it MUST
      // be in the DOM somewhere. Search every element's text content
      // for the pattern, and capture context around the first matches.
      const VIEW_RX = /(\\d+(?:[.,]\\d+)?\\s*[KkMmBb]?)\\s*(views?|plays?)/gi;
      const fullBody = document.body?.innerText || "";
      const bodyMatches = [];
      let m;
      while ((m = VIEW_RX.exec(fullBody)) !== null && bodyMatches.length < 10) {
        const start = Math.max(0, m.index - 30);
        const end = Math.min(fullBody.length, m.index + m[0].length + 30);
        bodyMatches.push({
          number: m[1],
          unit: m[2],
          context: fullBody.slice(start, end).replace(/\\n+/g, " | "),
        });
      }

      // Scan every element. For any whose direct text matches the
      // view-count pattern, grab its tag, classes, parent path, aria
      // labels, and innerText. This tells us EXACTLY which selector
      // we should target in the extractor.
      const domHits = [];
      const all = document.querySelectorAll("span, div, a, button, section");
      for (const el of Array.from(all)) {
        if (domHits.length >= 8) break;
        const text = (el.textContent || "").trim();
        if (text.length > 200) continue; // skip big containers
        const RX = /^\\s*\\d+(?:[.,]\\d+)?\\s*[KkMmBb]?\\s*(views?|plays?)\\s*$/i;
        if (!RX.test(text)) continue;
        // Walk up to 4 ancestors to build a useful selector path
        const path = [];
        let cur = el;
        for (let i = 0; i < 5 && cur; i++) {
          const cls = (cur.getAttribute && cur.getAttribute("class")) || "";
          const role = (cur.getAttribute && cur.getAttribute("role")) || "";
          const aria = (cur.getAttribute && cur.getAttribute("aria-label")) || "";
          path.push({
            tag: cur.tagName.toLowerCase(),
            classes: cls.slice(0, 60),
            role,
            aria: aria.slice(0, 60),
          });
          cur = cur.parentElement;
        }
        domHits.push({
          text,
          ariaLabel: el.getAttribute("aria-label") || null,
          dataAttrs: (() => {
            const out = {};
            for (const a of Array.from(el.attributes)) {
              if (a.name.startsWith("data-")) out[a.name] = a.value;
            }
            return out;
          })(),
          path,
        });
      }

      // Also catch elements with aria-label containing "view" or "play"
      const ariaHits = [];
      for (const el of Array.from(document.querySelectorAll("[aria-label]"))) {
        const aria = el.getAttribute("aria-label") || "";
        if (!/(view|play)/i.test(aria)) continue;
        if (ariaHits.length >= 8) break;
        ariaHits.push({
          aria,
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || "").trim().slice(0, 80),
        });
      }

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
        bodySnippet: (document.body?.innerText || "").slice(0, 2000),
        // NEW: views diagnostics
        bodyMatches,
        domHits,
        ariaHits,
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

  // ----- View-count hunt -----
  const d = dump as typeof dump & {
    bodyMatches?: Array<{ number: string; unit: string; context: string }>;
    domHits?: Array<{ text: string; ariaLabel: string | null; dataAttrs: Record<string, string>; path: Array<{ tag: string; classes: string; role: string; aria: string }> }>;
    ariaHits?: Array<{ aria: string; tag: string; text: string }>;
  };
  console.log("\n========== VIEW COUNT HUNT ==========");
  console.log(`Body-text matches for /(N) (views|plays)/ → ${d.bodyMatches?.length ?? 0}`);
  for (const bm of d.bodyMatches ?? []) {
    console.log(`  ${bm.number} ${bm.unit}    "${bm.context}"`);
  }
  console.log(`\nDOM elements whose entire text is "<N> views/plays" → ${d.domHits?.length ?? 0}`);
  for (const h of d.domHits ?? []) {
    console.log(`  text: "${h.text}"`);
    console.log(`    aria-label: ${h.ariaLabel || "(none)"}`);
    if (Object.keys(h.dataAttrs).length > 0) console.log(`    data-attrs: ${JSON.stringify(h.dataAttrs)}`);
    console.log(`    path: ${h.path.map((p) => `${p.tag}${p.classes ? "." + p.classes.split(" ").slice(0, 2).join(".") : ""}${p.role ? `[role=${p.role}]` : ""}${p.aria ? `[aria-label="${p.aria}"]` : ""}`).join(" > ")}`);
  }
  console.log(`\naria-label="...view..." or "...play..." → ${d.ariaHits?.length ?? 0}`);
  for (const a of d.ariaHits ?? []) {
    console.log(`  <${a.tag}> aria-label="${a.aria}"  text="${a.text}"`);
  }
  console.log("=====================================");

  // ----- Run the actual extractor that scrape.ts and backfill-details.ts use -----
  const extracted = (await page.evaluate(EXTRACT_POST_PAGE_JS)) as PostPageExtraction;
  console.log("\n========== EXTRACTOR OUTPUT ==========");
  console.log("caption:        ", JSON.stringify(extracted.caption.slice(0, 120)) + (extracted.caption.length > 120 ? "..." : ""));
  console.log("caption length: ", extracted.caption.length);
  console.log("isVideo:        ", extracted.isVideo);
  console.log("views:          ", extracted.views);
  console.log("likes:          ", extracted.likes);
  console.log("comments:       ", extracted.comments);
  console.log("publishedAt:    ", extracted.publishedAt);
  console.log("thumbnailUrl:   ", extracted.thumbnailUrl ? extracted.thumbnailUrl.slice(0, 80) + "..." : "null");
  console.log("======================================");
  console.log("\nIf caption + views look correct above, the backfill will fill them in.");
  console.log("If views = 0 but the post is a real video, IG is no longer embedding");
  console.log("play_count in inline JSON for logged-out sessions — we'd need to log in");
  console.log("via the browser-server's persistent profile to get them.");

  // Close the diagnostic's own tab so we don't leak tabs in the
  // long-running browser-server. Don't close the context/browser
  // when CDP-attached — those belong to browser-server.
  if (standalone && !browser) {
    try { await context.close(); } catch { /* ignore */ }
  } else {
    try { await page.close(); } catch { /* ignore */ }
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}

main().catch((err) => {
  console.error("[Diag] Fatal:", err);
  process.exit(1);
});
