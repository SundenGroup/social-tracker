import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { accountTagConfig, computeAutoTags, effectiveTags } from "@/lib/tagging";
import { regroupRecentForAccount } from "@/lib/content-grouping";

const ingestSchema = z.object({
  platform: z.enum(["tiktok", "youtube", "instagram", "twitter", "vk"]),
  accountId: z.string().min(1).max(255),
  posts: z.array(z.object({
    postId: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    contentUrl: z.string().url(),
    thumbnailUrl: z.string().optional(),
    publishedAt: z.string(),
    postType: z.string().optional(),
    // VK only: the video ID attached to this wall post (e.g. "456251681").
    // Lets the server correlate wall-level engagement (already in `metrics`)
    // with the separate video entity without re-scraping.
    attachedVideoId: z.string().optional(),
    metrics: z.object({
      views: z.number().int().nonnegative().optional(),
      likes: z.number().int().nonnegative().optional(),
      comments: z.number().int().nonnegative().optional(),
      shares: z.number().int().nonnegative().optional(),
    }),
  })).max(10000),
  stats: z.object({
    followers: z.number().int().nonnegative().optional(),
    following: z.number().int().nonnegative().optional(),
    videoCount: z.number().int().nonnegative().optional(),
  }).optional(),
});

/**
 * POST /api/sync/ingest — Accept scraped data from external collectors
 * (e.g., a MacBook running the TikTok scraper with residential IP)
 *
 * Authenticated via CRON_SECRET_TOKEN (same as daily sync trigger).
 * Body: { platform, accountId, posts: [...], stats?: { followers, ... } }
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET_TOKEN;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { platform, accountId, posts, stats } = parsed.data;

    // Find the social account
    const account = await prisma.socialAccount.findFirst({
      where: { platform, accountId },
    });

    // Pre-load the account's tag config once per request (used in the
    // per-post loop below). See lib/tagging.ts for engine details.
    const tagConfig = account
      ? accountTagConfig({ defaultTags: account.defaultTags, tagRules: account.tagRules })
      : { defaultTags: [], tagRules: null };

    if (!account) {
      return NextResponse.json(
        { error: `Account not found: ${platform}/${accountId}` },
        { status: 404 }
      );
    }

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        socialAccountId: account.id,
        syncType: "daily_update",
        status: "syncing",
        startedAt: new Date(),
      },
    });

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { syncStatus: "syncing" },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let postsSynced = 0;
    let metricsSynced = 0;
    const errors: string[] = [];

    // Upsert posts and metrics
    for (const post of posts) {
      try {
        // Sanitize text
        const sanitize = (text: string | undefined | null, max = 500) => {
          if (!text) return null;
          let clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
          clean = clean.replace(/\\/g, "");
          if (clean.length > max) clean = clean.substring(0, max);
          return clean;
        };

        // Defensive update semantics: for fields that scrapers sometimes
        // can't populate (title / description / thumbnail), ONLY write the
        // new value when the scraper actually supplied one. A scraper that
        // fell into a lean fallback path (e.g. Instagram's private API was
        // rate-limited) shouldn't be able to wipe a caption we already
        // stored from an earlier, full-data run. Metrics are already
        // zero-safe further down (only written when value > 0).
        const cleanTitle = sanitize(post.title, 200);
        const cleanDescription = sanitize(post.description);
        const cleanThumbnail = post.thumbnailUrl || null;

        // Auto-tag computation runs against the RAW (pre-sanitize) text
        // so hashtags at the end of long captions still register even
        // when the description gets truncated to 500 chars below.
        const autoTags = computeAutoTags(
          { title: post.title, description: post.description },
          tagConfig
        );

        // Look up existing manualTags so we can union them in. If the
        // post is new, manualTags is [] (default).
        const existing = await prisma.post.findUnique({
          where: {
            socialAccountId_postId: {
              socialAccountId: account.id,
              postId: post.postId,
            },
          },
          select: { manualTags: true },
        });
        const manualTags = existing?.manualTags ?? [];
        const finalTags = effectiveTags(autoTags, manualTags);

        await prisma.post.upsert({
          where: {
            socialAccountId_postId: {
              socialAccountId: account.id,
              postId: post.postId,
            },
          },
          create: {
            socialAccountId: account.id,
            platform: platform,
            postId: post.postId,
            postType: (post.postType as "video" | "short" | "image" | "carousel" | "text" | "slideshow") || "video",
            title: cleanTitle,
            description: cleanDescription,
            contentUrl: post.contentUrl,
            thumbnailUrl: cleanThumbnail,
            publishedAt: new Date(post.publishedAt),
            attachedVideoId: post.attachedVideoId ?? null,
            tags: finalTags,
            // manualTags defaults to [] for new posts. Only the per-post
            // PATCH endpoint mutates it.
          },
          update: {
            // Only write fields that the scraper actually supplied — never
            // clobber existing good data with null / empty string.
            ...(cleanTitle && { title: cleanTitle }),
            ...(cleanDescription && { description: cleanDescription }),
            ...(cleanThumbnail && { thumbnailUrl: cleanThumbnail }),
            publishedAt: new Date(post.publishedAt),
            lastMetricRefreshAt: new Date(),
            // Only update attachedVideoId when the sync actually provided it —
            // don't accidentally wipe it on a partial update.
            ...(post.attachedVideoId != null && { attachedVideoId: post.attachedVideoId }),
            // Recompute tags every ingest — auto tags reflect the latest
            // caption + rules, manual tags are preserved via union above.
            tags: finalTags,
          },
        });
        postsSynced++;

        // Upsert metrics
        const dbPost = await prisma.post.findUnique({
          where: {
            socialAccountId_postId: {
              socialAccountId: account.id,
              postId: post.postId,
            },
          },
          select: { id: true },
        });

        if (dbPost && post.metrics) {
          const metricEntries = [
            { type: "views" as const, value: post.metrics.views },
            { type: "likes" as const, value: post.metrics.likes },
            { type: "comments" as const, value: post.metrics.comments },
            { type: "shares" as const, value: post.metrics.shares },
          ];

          for (const { type, value } of metricEntries) {
            if (value != null && value > 0) {
              await prisma.postMetric.upsert({
                where: {
                  postId_metricType_metricDate: {
                    postId: dbPost.id,
                    metricType: type,
                    metricDate: today,
                  },
                },
                create: {
                  postId: dbPost.id,
                  socialAccountId: account.id,
                  platform: platform,
                  metricType: type,
                  metricDate: today,
                  metricValue: BigInt(value),
                },
                update: {
                  metricValue: BigInt(value),
                },
              });
              metricsSynced++;
            }
          }
        }
      } catch (err) {
        errors.push(`Post ${post.postId}: ${err}`);
      }
    }

    // Persist account stats to AccountDailyRollup if provided
    if (stats?.followers) {
      try {
        const rollupDate = new Date();
        rollupDate.setUTCHours(0, 0, 0, 0);

        // Get yesterday's rollup for newFollowers delta
        const yesterday = new Date(rollupDate.getTime() - 86400000);
        const prevRollup = await prisma.accountDailyRollup.findUnique({
          where: {
            socialAccountId_rollupDate: {
              socialAccountId: account.id,
              rollupDate: yesterday,
            },
          },
          select: { totalFollowers: true },
        });

        const prevFollowers = prevRollup ? Number(prevRollup.totalFollowers) : 0;
        const newFollowers = prevFollowers > 0 ? stats.followers - prevFollowers : 0;

        await prisma.accountDailyRollup.upsert({
          where: {
            socialAccountId_rollupDate: {
              socialAccountId: account.id,
              rollupDate: rollupDate,
            },
          },
          create: {
            socialAccountId: account.id,
            platform: platform,
            rollupDate: rollupDate,
            totalFollowers: BigInt(stats.followers),
            newFollowers: BigInt(Math.max(0, newFollowers)),
            postsPublished: postsSynced,
          },
          update: {
            totalFollowers: BigInt(stats.followers),
            newFollowers: BigInt(Math.max(0, newFollowers)),
            postsPublished: postsSynced,
          },
        });
      } catch (err) {
        console.error("[Ingest] Failed to persist account stats:", err);
      }
    }

    // Re-run cross-platform content grouping over the profile's recent
    // window now that new posts have landed. Non-fatal: grouping is a
    // presentation-layer concern and must never fail an ingest.
    try {
      const regrouped = await regroupRecentForAccount(account.id);
      if (regrouped > 0) {
        console.log(`[Ingest] Content grouping: ${regrouped} posts (re)assigned`);
      }
    } catch (err) {
      console.error("[Ingest] Content grouping failed (non-fatal):", err);
    }

    // Update sync log
    const status = errors.length > 0 ? "failed" : "success";
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status,
        postsSynced,
        metricsSynced,
        errorMessage: errors.length > 0 ? errors.slice(0, 10).join("; ") : null,
        completedAt: new Date(),
      },
    });

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        syncStatus: status as "success" | "failed",
        lastSyncedAt: new Date(),
      },
    });

    return NextResponse.json({
      status: "ok",
      postsSynced,
      metricsSynced,
      errors: errors.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Ingest] Error:", error);
    return NextResponse.json(
      { error: "Failed to ingest data" },
      { status: 500 }
    );
  }
}
