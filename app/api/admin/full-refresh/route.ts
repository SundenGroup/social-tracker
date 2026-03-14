import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { YouTubeCollector } from "@/lib/collectors/youtube";
import { TwitterCollector } from "@/lib/collectors/twitter";
import { InstagramCollector } from "@/lib/collectors/instagram";
import { TikTokCollector } from "@/lib/collectors/tiktok";
import type { BaseCollector } from "@/lib/collectors/base-collector";
import type { SocialAccount } from "@prisma/client";

interface RefreshState {
  isRunning: boolean;
  startedAt: number | null;
  totalPosts: number;
  processedPosts: number;
  metricsUpdated: number;
  currentAccount: string;
  currentPlatform: string;
  errors: string[];
  completedAt: number | null;
  accountsTotal: number;
  accountsProcessed: number;
}

// In-memory state — fine for single-server (DigitalOcean Droplet)
const refreshState: RefreshState = {
  isRunning: false,
  startedAt: null,
  totalPosts: 0,
  processedPosts: 0,
  metricsUpdated: 0,
  currentAccount: "",
  currentPlatform: "",
  errors: [],
  completedAt: null,
  accountsTotal: 0,
  accountsProcessed: 0,
};

function getCollector(account: SocialAccount): BaseCollector {
  switch (account.platform) {
    case "youtube":
      return new YouTubeCollector(account);
    case "twitter":
      return new TwitterCollector(account);
    case "instagram":
      return new InstagramCollector(account);
    case "tiktok":
      return new TikTokCollector(account);
  }
}

async function runFullRefresh(orgId: string) {
  refreshState.isRunning = true;
  refreshState.startedAt = Date.now();
  refreshState.processedPosts = 0;
  refreshState.metricsUpdated = 0;
  refreshState.errors = [];
  refreshState.completedAt = null;
  refreshState.accountsProcessed = 0;
  refreshState.currentAccount = "";
  refreshState.currentPlatform = "";

  try {
    const accounts = await prisma.socialAccount.findMany({
      where: { organizationId: orgId, isActive: true },
    });

    refreshState.accountsTotal = accounts.length;

    // Count total posts across all accounts
    const totalPosts = await prisma.post.count({
      where: {
        socialAccountId: { in: accounts.map((a) => a.id) },
        isDeleted: false,
      },
    });
    refreshState.totalPosts = totalPosts;

    console.log(
      `[FullRefresh] Starting refresh for ${accounts.length} accounts, ${totalPosts} total posts`
    );

    for (const account of accounts) {
      refreshState.currentAccount = account.accountName;
      refreshState.currentPlatform = account.platform;

      try {
        // Get all posts for this account from DB
        const posts = await prisma.post.findMany({
          where: { socialAccountId: account.id, isDeleted: false },
          select: { id: true, postId: true },
        });

        if (posts.length === 0) {
          refreshState.accountsProcessed++;
          continue;
        }

        console.log(
          `[FullRefresh] Processing ${account.platform}/${account.accountName}: ${posts.length} posts`
        );

        const externalPostIds = posts.map((p) => p.postId);
        const collector = getCollector(account);

        // Instagram caches metrics during fetchPosts — run it first
        if (account.platform === "instagram") {
          try {
            await collector.fetchPosts();
          } catch (err) {
            refreshState.errors.push(
              `Instagram fetchPosts for ${account.accountName}: ${String(err).slice(0, 100)}`
            );
          }
        }

        // Fetch metrics for ALL posts
        const metrics = await collector.fetchMetrics(externalPostIds);

        console.log(
          `[FullRefresh] Got ${metrics.length} metrics for ${account.accountName}`
        );

        // Build a lookup from external postId to DB id
        const postIdMap = new Map(posts.map((p) => [p.postId, p.id]));

        // Upsert metrics into DB
        for (const metric of metrics) {
          try {
            const dbPostId = postIdMap.get(metric.postId);
            if (!dbPostId) continue;

            await prisma.postMetric.upsert({
              where: {
                postId_metricType_metricDate: {
                  postId: dbPostId,
                  metricType: metric.metricType,
                  metricDate: metric.metricDate,
                },
              },
              create: {
                postId: dbPostId,
                socialAccountId: account.id,
                platform: account.platform,
                metricType: metric.metricType,
                metricDate: metric.metricDate,
                metricValue: metric.metricValue,
              },
              update: {
                metricValue: metric.metricValue,
              },
            });
            refreshState.metricsUpdated++;
          } catch (err) {
            refreshState.errors.push(
              `Metric upsert ${metric.postId}/${metric.metricType}: ${String(err).slice(0, 80)}`
            );
          }
        }

        refreshState.processedPosts += posts.length;
        refreshState.accountsProcessed++;
      } catch (err) {
        console.error(
          `[FullRefresh] Account ${account.accountName} failed:`,
          err
        );
        refreshState.errors.push(
          `${account.platform}/${account.accountName}: ${String(err).slice(0, 100)}`
        );

        // Still count posts as processed for ETA calculation
        const count = await prisma.post.count({
          where: { socialAccountId: account.id, isDeleted: false },
        });
        refreshState.processedPosts += count;
        refreshState.accountsProcessed++;
      }
    }

    console.log(
      `[FullRefresh] Complete: ${refreshState.processedPosts} posts, ${refreshState.metricsUpdated} metrics updated, ${refreshState.errors.length} errors`
    );
  } catch (err) {
    console.error("[FullRefresh] Fatal error:", err);
    refreshState.errors.push(`Fatal: ${String(err).slice(0, 200)}`);
  } finally {
    refreshState.isRunning = false;
    refreshState.completedAt = Date.now();
  }
}

// POST - Start a full metric refresh
export const POST = apiHandler(
  async (_req, session) => {
    if (refreshState.isRunning) {
      return NextResponse.json(
        { error: "A refresh is already in progress" },
        { status: 409 }
      );
    }

    const orgId = session!.user.organizationId;

    // Fire and forget — runs in background
    runFullRefresh(orgId).catch((err) => {
      console.error("[FullRefresh] Unhandled error:", err);
    });

    return NextResponse.json({ status: "started" });
  },
  { requireAuth: true }
);

// GET - Check current progress
export const GET = apiHandler(
  async () => {
    const elapsed = refreshState.startedAt
      ? (refreshState.completedAt ?? Date.now()) - refreshState.startedAt
      : 0;

    // Estimate remaining time based on current rate
    const rate =
      refreshState.processedPosts > 0 && elapsed > 0
        ? refreshState.processedPosts / (elapsed / 1000)
        : 0;
    const remaining =
      rate > 0
        ? ((refreshState.totalPosts - refreshState.processedPosts) / rate) *
          1000
        : 0;

    return NextResponse.json({
      data: {
        isRunning: refreshState.isRunning,
        startedAt: refreshState.startedAt,
        totalPosts: refreshState.totalPosts,
        processedPosts: refreshState.processedPosts,
        metricsUpdated: refreshState.metricsUpdated,
        currentAccount: refreshState.currentAccount,
        currentPlatform: refreshState.currentPlatform,
        errorCount: refreshState.errors.length,
        errors: refreshState.errors.slice(-5), // last 5 errors
        completedAt: refreshState.completedAt,
        accountsTotal: refreshState.accountsTotal,
        accountsProcessed: refreshState.accountsProcessed,
        elapsedMs: elapsed,
        estimatedRemainingMs: Math.round(remaining),
      },
    });
  },
  { requireAuth: true }
);
