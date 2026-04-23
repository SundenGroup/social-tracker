#!/usr/bin/env npx tsx
/**
 * Migration: Convert Instagram post IDs from numeric PKs to shortcodes.
 *
 * The old cookie-based scraper stored Instagram's internal numeric PKs as postId.
 * The new remote scraper uses shortcodes (from the URL). This migration:
 *
 *   1. For duplicates (same post exists with both ID formats):
 *      - Moves metrics from the shortcode copy to the numeric copy
 *      - Deletes the shortcode copy
 *   2. Updates all remaining numeric postIds to shortcodes (extracted from contentUrl)
 *
 * Safe to run multiple times — idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function extractShortcode(contentUrl: string): string | null {
  const m = contentUrl.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[2] : null;
}

async function main() {
  console.log("[Migration] Starting Instagram postId migration (numeric → shortcode)...\n");

  // Step 1: Find all Instagram posts with numeric IDs
  const numericPosts = await prisma.post.findMany({
    where: {
      platform: "instagram",
      postId: { not: { contains: "-" } }, // Shortcodes contain letters/hyphens, numeric IDs don't
    },
    select: {
      id: true,
      postId: true,
      contentUrl: true,
      socialAccountId: true,
    },
  });

  // Filter to only truly numeric IDs (>15 chars, all digits)
  const toMigrate = numericPosts.filter((p) => /^\d{15,}$/.test(p.postId));
  console.log(`[Migration] Found ${toMigrate.length} posts with numeric IDs to migrate`);

  let duplicatesResolved = 0;
  let idsUpdated = 0;
  let errors = 0;

  for (const post of toMigrate) {
    const shortcode = extractShortcode(post.contentUrl);
    if (!shortcode) {
      console.log(`[Migration] SKIP: No shortcode in contentUrl for post ${post.postId}`);
      errors++;
      continue;
    }

    try {
      // Check if a shortcode version of this post already exists
      const duplicate = await prisma.post.findUnique({
        where: {
          socialAccountId_postId: {
            socialAccountId: post.socialAccountId,
            postId: shortcode,
          },
        },
        select: { id: true },
      });

      if (duplicate) {
        // Duplicate exists — move metrics from shortcode copy to numeric copy, then delete shortcode copy
        const movedMetrics = await prisma.postMetric.updateMany({
          where: { postId: duplicate.id },
          data: { postId: post.id },
        });

        // Delete any metric duplicates (same postId + metricType + metricDate)
        // This can happen if both versions had metrics for the same day
        // Prisma doesn't support DELETE with JOIN, so we handle conflicts by
        // just ignoring the update errors — the unique constraint will prevent true dupes

        await prisma.post.delete({ where: { id: duplicate.id } });
        duplicatesResolved++;

        if (movedMetrics.count > 0) {
          console.log(
            `[Migration] Resolved duplicate: ${shortcode} (moved ${movedMetrics.count} metrics, deleted shortcode copy)`
          );
        }
      }

      // Now update the numeric postId to shortcode
      await prisma.post.update({
        where: { id: post.id },
        data: { postId: shortcode },
      });
      idsUpdated++;
    } catch (err: any) {
      // Handle unique constraint violation on metric move
      if (err.code === "P2002" || err.code === "P2025") {
        // Metric already exists for this date — delete the duplicate metric's source post
        try {
          // Delete orphaned metrics from the shortcode copy first
          const duplicate = await prisma.post.findUnique({
            where: {
              socialAccountId_postId: {
                socialAccountId: post.socialAccountId,
                postId: shortcode,
              },
            },
            select: { id: true },
          });
          if (duplicate) {
            await prisma.postMetric.deleteMany({ where: { postId: duplicate.id } });
            await prisma.post.delete({ where: { id: duplicate.id } });
          }
          await prisma.post.update({
            where: { id: post.id },
            data: { postId: shortcode },
          });
          duplicatesResolved++;
          idsUpdated++;
        } catch (innerErr) {
          console.error(`[Migration] ERROR on ${post.postId} → ${shortcode}:`, innerErr);
          errors++;
        }
      } else {
        console.error(`[Migration] ERROR on ${post.postId} → ${shortcode}:`, err.message);
        errors++;
      }
    }
  }

  console.log(`\n[Migration] Done!`);
  console.log(`  IDs updated: ${idsUpdated}`);
  console.log(`  Duplicates resolved: ${duplicatesResolved}`);
  console.log(`  Errors: ${errors}`);

  // Verify
  const remaining = await prisma.post.count({
    where: {
      platform: "instagram",
    },
  });
  const numericRemaining = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Post"
    WHERE platform = 'instagram' AND "postId" ~ '^[0-9]{15,}$'
  `;
  console.log(`\n  Total Instagram posts: ${remaining}`);
  console.log(`  Numeric IDs remaining: ${numericRemaining[0].count}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[Migration] Fatal error:", err);
  process.exit(1);
});
