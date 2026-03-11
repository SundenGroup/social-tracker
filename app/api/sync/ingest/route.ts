import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
    const { platform, accountId, posts, stats } = body as {
      platform: string;
      accountId: string;
      posts: {
        postId: string;
        title?: string;
        description?: string;
        contentUrl: string;
        thumbnailUrl?: string;
        publishedAt: string;
        postType?: string;
        metrics: {
          views?: number;
          likes?: number;
          comments?: number;
          shares?: number;
        };
      }[];
      stats?: {
        followers?: number;
        following?: number;
        videoCount?: number;
      };
    };

    // Find the social account
    const account = await prisma.socialAccount.findFirst({
      where: { platform: platform as "tiktok" | "youtube" | "instagram" | "twitter", accountId },
    });

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
          // eslint-disable-next-line no-control-regex
          let clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
          clean = clean.replace(/\\/g, "");
          if (clean.length > max) clean = clean.substring(0, max);
          return clean;
        };

        await prisma.post.upsert({
          where: {
            socialAccountId_postId: {
              socialAccountId: account.id,
              postId: post.postId,
            },
          },
          create: {
            socialAccountId: account.id,
            platform: platform as "tiktok",
            postId: post.postId,
            postType: (post.postType as "video" | "short") || "video",
            title: sanitize(post.title, 200),
            description: sanitize(post.description),
            contentUrl: post.contentUrl,
            thumbnailUrl: post.thumbnailUrl || null,
            publishedAt: new Date(post.publishedAt),
          },
          update: {
            title: sanitize(post.title, 200),
            description: sanitize(post.description),
            thumbnailUrl: post.thumbnailUrl || null,
            lastMetricRefreshAt: new Date(),
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
                  platform: platform as "tiktok",
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
            platform: platform as "tiktok",
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
