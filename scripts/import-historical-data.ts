/**
 * Import historical data from Excel exports into the database.
 * Imports posts and metrics for Instagram, TikTok, and Twitter
 * that are older than what's already in the DB.
 *
 * Usage: npx tsx scripts/import-historical-data.ts
 * Must be run from the project root with DATABASE_URL set.
 */

import XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Account IDs from the database
const ACCOUNTS = {
  instagram: { id: "cmmk9e66n00080c40gy8hdzhl", accountId: "pubgesports" },
  tiktok: { id: "cmmk9euz7000a0c40jykypgf3", accountId: "pubg.esports.official" },
  twitter: { id: "cmmk9dkhc00060c40a9360of7", accountId: "pubgesports" },
};

// Cutoff dates — only import posts published BEFORE these dates
const CUTOFFS = {
  instagram: new Date("2025-12-13"),
  tiktok: new Date("2025-11-26"),
  twitter: new Date("2026-02-09"),
};

function sanitize(text: string | undefined | null, max = 500): string | null {
  if (!text) return null;
  // eslint-disable-next-line no-control-regex
  let clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  clean = clean.replace(/\\/g, "");
  if (clean.length > max) clean = clean.substring(0, max);
  return clean;
}

function extractPostId(url: string, platform: string): string | null {
  try {
    if (platform === "instagram") {
      // https://www.instagram.com/p/XXXXX/ or /reel/XXXXX/
      const match = url.match(/\/(p|reel|tv)\/([^/?]+)/);
      return match ? match[2] : null;
    }
    if (platform === "tiktok") {
      // https://www.tiktok.com/@user/video/1234567890
      const match = url.match(/\/video\/(\d+)/);
      return match ? match[1] : null;
    }
    if (platform === "twitter") {
      // https://x.com/user/status/1234567890
      const match = url.match(/\/status\/(\d+)/);
      return match ? match[1] : null;
    }
  } catch {
    return null;
  }
  return null;
}

function mapInstagramType(type: string): "video" | "image" | "carousel" {
  if (type === "Video/Reel") return "video";
  if (type === "Photo") return "image";
  if (type === "Carousel") return "carousel";
  return "image";
}

async function importInstagram() {
  console.log("\n--- Importing Instagram ---");
  const wb = XLSX.readFile("old-data/PUBG_Esports_Instagram_Data.xlsx");
  const ws = wb.Sheets["All Posts"];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const account = ACCOUNTS.instagram;
  const cutoff = CUTOFFS.instagram;
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const dateStr = String(row["Date"] || "");
      const timeStr = String(row["Time (UTC)"] || "00:00:00");
      if (!dateStr) { skipped++; continue; }

      const publishedAt = new Date(`${dateStr}T${timeStr}Z`);
      if (isNaN(publishedAt.getTime())) { skipped++; continue; }
      if (publishedAt >= cutoff) { skipped++; continue; }

      const postUrl = String(row["Post URL"] || "");
      const postId = extractPostId(postUrl, "instagram");
      if (!postId) { skipped++; continue; }

      const postType = mapInstagramType(String(row["Type"] || ""));
      const likes = Number(row["Likes"] || 0);
      const comments = Number(row["Comments"] || 0);
      const views = Number(row["Play Count"] || 0);

      // Use publishedAt date as the metric date for historical data
      const metricDate = new Date(publishedAt);
      metricDate.setUTCHours(0, 0, 0, 0);

      // Upsert post
      const dbPost = await prisma.post.upsert({
        where: {
          socialAccountId_postId: {
            socialAccountId: account.id,
            postId,
          },
        },
        create: {
          socialAccountId: account.id,
          platform: "instagram",
          postId,
          postType,
          title: null,
          contentUrl: postUrl,
          thumbnailUrl: null,
          publishedAt,
        },
        update: {},
        select: { id: true },
      });

      // Upsert metrics
      const metrics = [
        { type: "views" as const, value: views },
        { type: "likes" as const, value: likes },
        { type: "comments" as const, value: comments },
      ];

      for (const { type, value } of metrics) {
        if (value > 0) {
          await prisma.postMetric.upsert({
            where: {
              postId_metricType_metricDate: {
                postId: dbPost.id,
                metricType: type,
                metricDate,
              },
            },
            create: {
              postId: dbPost.id,
              socialAccountId: account.id,
              platform: "instagram",
              metricType: type,
              metricDate,
              metricValue: BigInt(value),
            },
            update: {
              metricValue: BigInt(value),
            },
          });
        }
      }

      imported++;
    } catch (err) {
      errors++;
      if (errors <= 3) console.error("  Error:", err);
    }
  }

  console.log(`  Total rows: ${rows.length}, Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
}

async function importTikTok() {
  console.log("\n--- Importing TikTok ---");
  const wb = XLSX.readFile("old-data/PUBG_Esports_TikTok_Data.xlsx");
  const ws = wb.Sheets["TikTok Videos"];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const account = ACCOUNTS.tiktok;
  const cutoff = CUTOFFS.tiktok;
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const dateStr = String(row["Date"] || "");
      if (!dateStr || dateStr === "TOTAL") { skipped++; continue; }

      const publishedAt = new Date(`${dateStr}T00:00:00Z`);
      if (isNaN(publishedAt.getTime())) { skipped++; continue; }
      if (publishedAt >= cutoff) { skipped++; continue; }

      const postUrl = String(row["URL"] || "");
      const videoId = String(row["Video ID"] || "");
      const postId = videoId || extractPostId(postUrl, "tiktok");
      if (!postId) { skipped++; continue; }

      const description = sanitize(String(row["Description"] || ""), 200);
      const views = Number(row["Views"] || 0);
      const likes = Number(row["Likes"] || 0);
      const comments = Number(row["Comments"] || 0);
      const shares = Number(row["Shares"] || 0);

      const metricDate = new Date(publishedAt);
      metricDate.setUTCHours(0, 0, 0, 0);

      const dbPost = await prisma.post.upsert({
        where: {
          socialAccountId_postId: {
            socialAccountId: account.id,
            postId,
          },
        },
        create: {
          socialAccountId: account.id,
          platform: "tiktok",
          postId,
          postType: "video",
          title: description,
          contentUrl: postUrl || `https://www.tiktok.com/@pubg.esports.official/video/${videoId}`,
          thumbnailUrl: null,
          publishedAt,
        },
        update: {},
        select: { id: true },
      });

      const metrics = [
        { type: "views" as const, value: views },
        { type: "likes" as const, value: likes },
        { type: "comments" as const, value: comments },
        { type: "shares" as const, value: shares },
      ];

      for (const { type, value } of metrics) {
        if (value > 0) {
          await prisma.postMetric.upsert({
            where: {
              postId_metricType_metricDate: {
                postId: dbPost.id,
                metricType: type,
                metricDate,
              },
            },
            create: {
              postId: dbPost.id,
              socialAccountId: account.id,
              platform: "tiktok",
              metricType: type,
              metricDate,
              metricValue: BigInt(value),
            },
            update: {
              metricValue: BigInt(value),
            },
          });
        }
      }

      imported++;
    } catch (err) {
      errors++;
      if (errors <= 3) console.error("  Error:", err);
    }
  }

  console.log(`  Total rows: ${rows.length}, Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
}

async function importTwitter() {
  console.log("\n--- Importing Twitter ---");
  const wb = XLSX.readFile("old-data/PUBG_Esports_X_Data.xlsx");
  const ws = wb.Sheets["All Posts"];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const account = ACCOUNTS.twitter;
  const cutoff = CUTOFFS.twitter;
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const dateStr = String(row["Date"] || "");
      if (!dateStr) { skipped++; continue; }

      const publishedAt = new Date(`${dateStr}T00:00:00Z`);
      if (isNaN(publishedAt.getTime())) { skipped++; continue; }
      if (publishedAt >= cutoff) { skipped++; continue; }

      const postUrl = String(row["Post URL"] || "");
      const postId = extractPostId(postUrl, "twitter");
      if (!postId) { skipped++; continue; }

      const textPreview = sanitize(String(row["Text Preview"] || ""), 200);
      const likes = Number(row["Likes"] || 0);
      const retweets = Number(row["Retweets"] || 0);
      const replies = Number(row["Replies"] || 0);
      const views = Number(row["Views"] || 0);

      const metricDate = new Date(publishedAt);
      metricDate.setUTCHours(0, 0, 0, 0);

      // Determine post type — if views > 0 likely has video, otherwise text/image
      const postType = views > 0 ? "video" as const : "text" as const;

      const dbPost = await prisma.post.upsert({
        where: {
          socialAccountId_postId: {
            socialAccountId: account.id,
            postId,
          },
        },
        create: {
          socialAccountId: account.id,
          platform: "twitter",
          postId,
          postType,
          title: textPreview,
          contentUrl: postUrl,
          thumbnailUrl: null,
          publishedAt,
        },
        update: {},
        select: { id: true },
      });

      const metrics = [
        { type: "views" as const, value: views },
        { type: "likes" as const, value: likes },
        { type: "comments" as const, value: replies },
        { type: "shares" as const, value: retweets },
      ];

      for (const { type, value } of metrics) {
        if (value > 0) {
          await prisma.postMetric.upsert({
            where: {
              postId_metricType_metricDate: {
                postId: dbPost.id,
                metricType: type,
                metricDate,
              },
            },
            create: {
              postId: dbPost.id,
              socialAccountId: account.id,
              platform: "twitter",
              metricType: type,
              metricDate,
              metricValue: BigInt(value),
            },
            update: {
              metricValue: BigInt(value),
            },
          });
        }
      }

      imported++;
    } catch (err) {
      errors++;
      if (errors <= 3) console.error("  Error:", err);
    }
  }

  console.log(`  Total rows: ${rows.length}, Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
}

async function main() {
  console.log("=== Historical Data Import ===");
  console.log("Cutoffs:", {
    instagram: CUTOFFS.instagram.toISOString().split("T")[0],
    tiktok: CUTOFFS.tiktok.toISOString().split("T")[0],
    twitter: CUTOFFS.twitter.toISOString().split("T")[0],
  });

  await importInstagram();
  await importTikTok();
  await importTwitter();

  console.log("\n=== Done ===");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});
