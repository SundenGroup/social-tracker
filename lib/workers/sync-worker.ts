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
  // Check for already-running sync
  const running = await prisma.syncLog.findFirst({
    where: {
      socialAccountId: accountId,
      status: { in: ["pending", "syncing"] },
    },
  });

  if (running) {
    throw new Error("A sync is already in progress for this account");
  }

  const syncLog = await prisma.syncLog.create({
    data: {
      socialAccountId: accountId,
      syncType,
      status: "pending",
      startedAt: new Date(),
    },
  });

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
    // Delete the pending syncLog — the collector's sync() creates its own
    await prisma.syncLog.delete({ where: { id: syncLogId } });

    const collector = getCollector(account);
    await collector.sync(syncType);
  } catch (err) {
    console.error(
      `[SyncWorker] Attempt ${attempt}/${MAX_RETRIES} failed for ${account.accountName}:`,
      err
    );

    if (attempt < MAX_RETRIES) {
      // Exponential backoff: 2s, 4s, 8s
      const backoff = Math.pow(2, attempt) * 1000;
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
