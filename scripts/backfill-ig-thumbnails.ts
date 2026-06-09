#!/usr/bin/env npx tsx
/**
 * Backfill Instagram thumbnails from the MAC (residential IP).
 *
 * The Instagram CDN 403s the droplet, so the server-side proxy can't
 * fetch IG covers. This script runs where the IP isn't blocked: it
 * drains GET /api/thumb/pending?platform=instagram, downloads each
 * cover locally, and POSTs the bytes to /api/thumb/upload, which
 * persists a permanent copy. After this runs, IG thumbnails survive
 * their CDN URL's expiry.
 *
 * Re-run periodically (e.g. weekly) to capture newly-synced posts
 * while their signed URLs are still valid.
 *
 * Usage (on the Mac):
 *   API_URL=https://social.clutch.game API_TOKEN=<cron_secret> \
 *     npx tsx scripts/backfill-ig-thumbnails.ts [platform]
 */

const API_URL = process.env.API_URL || "https://social.clutch.game";
const API_TOKEN = process.env.API_TOKEN || "";
const PLATFORM = process.argv[2] || "instagram";
const BATCH = 300;

if (!API_TOKEN) {
  console.error("Set API_TOKEN to the server's CRON_SECRET_TOKEN.");
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPending(): Promise<Array<{ id: string; thumbnailUrl: string }>> {
  const res = await fetch(
    `${API_URL}/api/thumb/pending?platform=${PLATFORM}&limit=${BATCH}`,
    { headers: { Authorization: `Bearer ${API_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`pending ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { pending: Array<{ id: string; thumbnailUrl: string }> };
  return json.pending ?? [];
}

async function downloadAndUpload(id: string, url: string): Promise<boolean> {
  try {
    const imgRes = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        Referer: "https://www.instagram.com/",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!imgRes.ok) return false;
    const type = imgRes.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return false;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length === 0) return false;

    const up = await fetch(`${API_URL}/api/thumb/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_TOKEN}` },
      body: JSON.stringify({ id, dataBase64: buf.toString("base64") }),
    });
    return up.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`[IG-Backfill] Draining pending ${PLATFORM} thumbnails from ${API_URL} ...`);
  let round = 0;
  let totalOk = 0;
  let totalFail = 0;

  for (;;) {
    const pending = await fetchPending();
    if (pending.length === 0) {
      console.log("[IG-Backfill] Nothing pending — done.");
      break;
    }
    round++;
    console.log(`[IG-Backfill] Round ${round}: ${pending.length} to fetch.`);

    let ok = 0;
    let fail = 0;
    for (let i = 0; i < pending.length; i++) {
      const { id, thumbnailUrl } = pending[i];
      const success = await downloadAndUpload(id, thumbnailUrl);
      if (success) ok++;
      else fail++;
      if ((i + 1) % 50 === 0) console.log(`  ... ${i + 1}/${pending.length} (ok ${ok}, fail ${fail})`);
      await sleep(120 + Math.random() * 180); // be polite to the CDN
    }
    totalOk += ok;
    totalFail += fail;
    console.log(`[IG-Backfill] Round ${round} complete: ok ${ok}, fail ${fail}.`);

    // If a whole round failed to store anything, the remaining URLs are
    // likely expired — stop rather than loop forever on the same set.
    if (ok === 0) {
      console.log("[IG-Backfill] No successes this round (URLs likely expired) — stopping.");
      break;
    }
  }

  console.log(`\n[IG-Backfill] Total stored ${totalOk}, failed ${totalFail}.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
