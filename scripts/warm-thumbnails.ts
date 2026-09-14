/**
 * Thumbnail warmer — runs on the scraper Mac (residential IP).
 *
 * Drains /api/thumb/pending: downloads each uncached thumbnail from
 * the platform CDN while its signed URL is still valid and uploads the
 * bytes to /api/thumb/upload, where they're resized and stored
 * PERMANENTLY in the droplet cache. From then on /api/thumb/<id>
 * serves our copy forever — reports and dashboards keep their images
 * long after the platform URL expires.
 *
 * Why here and not the droplet: Instagram's CDN 403s datacenter IPs.
 *
 * Rate-limit shield: a 403 on an OLD post is just an expired URL
 * (unrecoverable — counted and skipped); a streak of 403s on FRESH
 * posts (≤14 days) means the CDN is throttling this IP — abort.
 *
 * Usage:  npx tsx scripts/warm-thumbnails.ts [platform] [limit]
 *         (defaults: instagram 250)
 * Called automatically by the Instagram scraper after each run.
 * Env: API_URL + API_TOKEN from scripts/instagram-remote-scraper/.env
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// Reuse the scraper's env — same API + token.
const envPath = join(SCRIPT_DIR, "instagram-remote-scraper", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const API_URL = process.env.API_URL ?? "https://social.clutch.game";
const API_TOKEN = process.env.API_TOKEN ?? "";
const PLATFORM = process.argv[2] || "instagram";
const LIMIT = Math.min(Number(process.argv[3] || 250), 1000);

const FRESH_DAYS = 14;
const FRESH_403_ABORT = 5; // consecutive fresh-post 403s = rate limited
const DELAY_MS = 1800; // gentle pacing — the CDN sees a casual browser, not a crawler

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms + Math.random() * 600));

async function main() {
  if (!API_TOKEN) {
    console.error("[warm] Missing API_TOKEN (scripts/instagram-remote-scraper/.env)");
    process.exit(1);
  }

  const pendingRes = await fetch(`${API_URL}/api/thumb/pending?platform=${PLATFORM}&limit=${LIMIT}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  if (!pendingRes.ok) {
    console.error(`[warm] pending fetch failed: ${pendingRes.status}`);
    process.exit(1);
  }
  const { pending } = (await pendingRes.json()) as {
    pending: Array<{ id: string; thumbnailUrl: string; publishedAt: string }>;
  };

  console.log(`[warm] ${PLATFORM}: ${pending.length} thumbnails to cache`);
  if (pending.length === 0) return;

  const freshCutoff = Date.now() - FRESH_DAYS * 86400000;
  let stored = 0;
  let expired = 0;
  let failed = 0;
  let fresh403Streak = 0;

  for (const item of pending) {
    const isFresh = new Date(item.publishedAt).getTime() > freshCutoff;
    try {
      const imgRes = await fetch(item.thumbnailUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(20000),
      });

      if (imgRes.status === 403 || imgRes.status === 410 || imgRes.status === 404) {
        if (isFresh) {
          fresh403Streak++;
          if (fresh403Streak >= FRESH_403_ABORT) {
            console.error(
              `[warm] ${FRESH_403_ABORT} consecutive ${imgRes.status}s on fresh posts — likely rate-limited, aborting (stored ${stored} so far)`
            );
            break;
          }
        }
        expired++;
        await sleep(DELAY_MS);
        continue;
      }
      if (!imgRes.ok || !(imgRes.headers.get("content-type") ?? "").startsWith("image/")) {
        failed++;
        await sleep(DELAY_MS);
        continue;
      }
      fresh403Streak = 0;

      const bytes = Buffer.from(await imgRes.arrayBuffer());
      const upRes = await fetch(`${API_URL}/api/thumb/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, dataBase64: bytes.toString("base64") }),
      });
      if (upRes.ok) stored++;
      else failed++;
    } catch {
      failed++;
    }
    await sleep(DELAY_MS);
  }

  console.log(`[warm] done: ${stored} stored, ${expired} expired/gone, ${failed} failed`);
}

main().catch((err) => {
  console.error("[warm] Fatal:", err);
  process.exit(1);
});
