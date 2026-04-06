import { prisma } from "@/lib/db";
import { BaseCollector } from "@/lib/collectors/base-collector";
import { YouTubeCollector } from "@/lib/collectors/youtube";
import { TwitterCollector } from "@/lib/collectors/twitter";
import { InstagramCollector } from "@/lib/collectors/instagram";
import { TikTokCollector } from "@/lib/collectors/tiktok";
import type { SocialAccount, SyncType } from "@prisma/client";

/**
 * Prisma-based sync queue (no Redis required).
 * Uses the SyncLog table as a simple job queue.
 */

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

/**
 * Queue a sync job by creating a pending SyncLog entry.
 */
export async function queueSync(
  accountId: string,
  syncType: SyncType
): Promise<string> {
  // Atomic check-and-create: expire stale jobs, verify no active sync, create new log
  const syncLog = await prisma.$transaction(async (tx) => {
    // Platform-aware stale threshold: API-based (30min) vs browser-based scrapers (60min)
    const account = await tx.socialAccount.findUnique({ where: { id: accountId }, select: { platform: true } });
    const isBrowserBased = account?.platform === "tiktok" || account?.platform === "instagram";
    const STALE_THRESHOLD = (isBrowserBased ? 60 : 30) * 60 * 1000;
    const staleDate = new Date(Date.now() - STALE_THRESHOLD);
    const { count: expiredCount } = await tx.syncLog.updateMany({
      where: {
        socialAccountId: accountId,
        status: { in: ["pending", "syncing"] },
        startedAt: { lt: staleDate },
      },
      data: { status: "failed", errorMessage: "Auto-expired: stuck for >30 minutes", completedAt: new Date() },
    });

    if (expiredCount > 0) {
      console.log(`[SyncWorker] Expired ${expiredCount} stale sync(s) for account ${accountId}`);
    }

    // Check for already-running sync (within the same transaction — no race window)
    const running = await tx.syncLog.findFirst({
      where: {
        socialAccountId: accountId,
        status: { in: ["pending", "syncing"] },
      },
    });

    if (running) {
      throw new Error("A sync is already in progress for this account");
    }

    return tx.syncLog.create({
      data: {
        socialAccountId: accountId,
        syncType,
        status: "pending",
        startedAt: new Date(),
      },
    });
  }, { isolationLevel: "Serializable" });

  // Fire and forget — process async
  processSyncJob(syncLog.id, accountId, syncType).catch((err) => {
    console.error(`[SyncWorker] Unhandled error for job ${syncLog.id}:`, err);
  });

  return syncLog.id;
}

/**
 * Process a single sync job with retry logic.
 */
async function processSyncJob(
  syncLogId: string,
  accountId: string,
  syncType: SyncType,
  attempt = 1
): Promise<void> {
  const MAX_RETRIES = 3;

  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    await prisma.syncLog.update({
      where: { id: syncLogId },
      data: {
        status: "failed",
        errorMessage: "Account not found",
        completedAt: new Date(),
      },
    });
    return;
  }

  try {
    // Skip Instagram accounts with no auth token — they use the remote scraper
    if (account.platform === "instagram" && !account.authToken) {
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: { status: "failed", errorMessage: "Skipped — uses remote scraper", completedAt: new Date() },
      });
      console.log(`[SyncWorker] Skipping ${account.accountName} — uses remote scraper`);
      return;
    }

    // Update the existing syncLog to syncing (instead of deleting — preserves audit trail)
    await prisma.syncLog.update({
      where: { id: syncLogId },
      data: { status: "syncing" },
    });

    const collector = getCollector(account);
    await collector.sync(syncType, syncLogId);
  } catch (err) {
    console.error(
      `[SyncWorker] Attempt ${attempt}/${MAX_RETRIES} failed for ${account.accountName}:`,
      err
    );

    // Ensure the sync log is marked failed
    await prisma.syncLog.update({
      where: { id: syncLogId },
      data: { status: "failed", errorMessage: err instanceof Error ? err.message : String(err), completedAt: new Date() },
    }).catch(() => { /* log may already be updated by collector */ });

    if (attempt < MAX_RETRIES) {
      // Exponential backoff with jitter
      const backoff = Math.pow(2, attempt) * 1000 * (0.5 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, backoff));

      // Re-create pending log for retry
      const retryLog = await prisma.syncLog.create({
        data: {
          socialAccountId: accountId,
          syncType,
          status: "pending",
          startedAt: new Date(),
        },
      });

      return processSyncJob(retryLog.id, accountId, syncType, attempt + 1);
    }

    // Final failure — ensure status is recorded
    await prisma.socialAccount.update({
      where: { id: accountId },
      data: { syncStatus: "failed" },
    });
  }
}

/**
 * Process all pending syncs (called by cron or manually).
 */
export async function processAllPendingSyncs(): Promise<void> {
  const pending = await prisma.syncLog.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  console.log(`[SyncWorker] Processing ${pending.length} pending sync jobs`);

  for (const job of pending) {
    await processSyncJob(job.id, job.socialAccountId, job.syncType);
  }
}
