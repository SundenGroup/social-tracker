/**
 * Server-side thumbnail cache + placeholder helpers.
 *
 * The on-disk cache lives OUTSIDE the git repo (default
 * /root/clutch-thumbnails, overridable via THUMBNAIL_DIR) so deploys
 * (git pull / rebuild) never wipe it. Files are keyed by the post's
 * cuid: <id>.jpg.
 *
 * Used by app/api/thumb/[id]/route.ts (read/fetch/serve) and
 * app/api/thumb/upload/route.ts (write from the Mac backfill).
 */
import { promises as fs } from "fs";
import * as path from "path";
import sharp from "sharp";

const THUMB_DIR =
  process.env.THUMBNAIL_DIR ||
  (process.env.NODE_ENV === "production"
    ? "/root/clutch-thumbnails"
    : path.join(process.cwd(), ".thumbnails"));

// Max stored width — thumbnails render at <=320px in the UI, so 480px
// covers retina without storing the original 1080px covers.
const MAX_WIDTH = 480;
const JPEG_QUALITY = 80;

export function cachePath(id: string): string {
  // Guard against path traversal — ids are cuids (alphanumeric) but be
  // defensive since this comes from a route param.
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(THUMB_DIR, `${safe}.jpg`);
}

export async function ensureDir(): Promise<void> {
  await fs.mkdir(THUMB_DIR, { recursive: true });
}

/** Return cached bytes for this id, or null if not cached yet. */
export async function readCached(id: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(cachePath(id));
  } catch {
    return null;
  }
}

/** Normalise + resize raw image bytes and write them to the cache. */
export async function writeCached(id: string, input: Buffer): Promise<Buffer> {
  await ensureDir();
  const out = await sharp(input)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  await fs.writeFile(cachePath(id), out);
  return out;
}

/**
 * Fetch a remote thumbnail and cache it. Returns the cached bytes, or
 * null on any failure (expired URL, 403, non-image, network error).
 * Never throws — callers fall back to the placeholder.
 */
export async function fetchAndCache(id: string, url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        // A normal UA — some CDNs reject the default fetch agent.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    return await writeCached(id, buf);
  } catch {
    return null;
  }
}

// Brand colours for the placeholder background tint.
const PLATFORM_COLOR: Record<string, string> = {
  tiktok: "#FE2C55",
  instagram: "#E1306C",
  youtube: "#FF0000",
  twitter: "#1DA1F2",
  vk: "#0077FF",
};

// Minimal platform glyph paths (24x24 viewBox), monochrome.
const PLATFORM_GLYPH: Record<string, string> = {
  tiktok:
    "M16.5 5.5a4.5 4.5 0 0 0 3.5 1.7V10a7.7 7.7 0 0 1-3.6-.9v5.6a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v2.5a3.2 3.2 0 1 0 2.2 3V3h2.7c0 .9.3 1.8.9 2.5Z",
  instagram:
    "M12 7.5A4.5 4.5 0 1 0 16.5 12 4.5 4.5 0 0 0 12 7.5Zm0 7.4A2.9 2.9 0 1 1 14.9 12 2.9 2.9 0 0 1 12 14.9Zm4.7-7.6a1.05 1.05 0 1 1-1-1.05 1.05 1.05 0 0 1 1 1.05ZM12 4.6c2.4 0 2.7 0 3.6.05a4.9 4.9 0 0 1 1.7.3 2.9 2.9 0 0 1 1.7 1.7 4.9 4.9 0 0 1 .3 1.7c.04.9.05 1.2.05 3.6s0 2.7-.05 3.6a4.9 4.9 0 0 1-.3 1.7 2.9 2.9 0 0 1-1.7 1.7 4.9 4.9 0 0 1-1.7.3c-.9.04-1.2.05-3.6.05s-2.7 0-3.6-.05a4.9 4.9 0 0 1-1.7-.3 2.9 2.9 0 0 1-1.7-1.7 4.9 4.9 0 0 1-.3-1.7C4.6 14.7 4.6 14.4 4.6 12s0-2.7.05-3.6a4.9 4.9 0 0 1 .3-1.7 2.9 2.9 0 0 1 1.7-1.7 4.9 4.9 0 0 1 1.7-.3c.9-.04 1.2-.05 3.6-.05Z",
  youtube:
    "M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3Z",
  twitter:
    "M18.9 7.3c.01.16.01.32.01.48 0 4.9-3.7 10.5-10.5 10.5A10.4 10.4 0 0 1 3 16.6a7.4 7.4 0 0 0 5.4-1.5 3.7 3.7 0 0 1-3.4-2.6 3.7 3.7 0 0 0 1.7-.06 3.7 3.7 0 0 1-3-3.6v-.05a3.7 3.7 0 0 0 1.7.5 3.7 3.7 0 0 1-1.1-4.9 10.5 10.5 0 0 0 7.6 3.9 3.7 3.7 0 0 1 6.3-3.4 7.3 7.3 0 0 0 2.3-.9 3.7 3.7 0 0 1-1.6 2 7.3 7.3 0 0 0 2.1-.6 7.5 7.5 0 0 1-1.8 1.9Z",
  vk: "M12.6 16.1c-5.5 0-8.6-3.8-8.7-10h2.7c.1 4.6 2.1 6.5 3.7 6.9V6.1h2.6v3.9c1.6-.2 3.2-1.9 3.8-3.9h2.6a7.6 7.6 0 0 1-3.5 5c1.7 1 3.2 2.4 3.8 4.9h-2.9c-.4-1.5-1.6-2.7-3.8-2.9v2.9Z",
};

/**
 * Generate a branded placeholder SVG for a post that has no usable
 * thumbnail. Looks intentional — a subtle platform-tinted gradient
 * with the platform glyph centred — so the UI never shows a blank box.
 */
export function placeholderSvg(platform: string): string {
  const color = PLATFORM_COLOR[platform] || "#8a8f98";
  const glyph = PLATFORM_GLYPH[platform] || "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.06"/>
    </linearGradient>
  </defs>
  <rect width="480" height="480" fill="#f4f4f5"/>
  <rect width="480" height="480" fill="url(#g)"/>
  ${
    glyph
      ? `<g transform="translate(168 168) scale(6)"><path d="${glyph}" fill="${color}" fill-opacity="0.55"/></g>`
      : ""
  }
</svg>`;
}
