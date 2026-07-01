import { prisma } from "@/lib/db";
import { queueSync } from "@/lib/workers/sync-worker";

/**
 * Clean up expired sessions and verification tokens.
 * Prevents unbounded DB growth from stale auth data.
 */
export async function cleanupExpiredAuthData(): Promise<void> {
  const now = new Date();

  const [sessions, tokens] = await Promise.all([
    prisma.session.deleteMany({ where: { expires: { lt: now } } }),
    prisma.verificationToken.deleteMany({ where: { expires: { lt: now } } }),
  ]);

  if (sessions.count > 0 || tokens.count > 0) {
    console.log(`[Cron] Cleaned up ${sessions.count} expired sessions, ${tokens.count} expired tokens`);
  }
}

/**
 * Daily sync job — triggers sync for all active social accounts.
 * Intended to run at 2 AM UTC via external cron trigger (e.g., Vercel Cron).
 *
 * Call this from an API route: POST /api/cron/daily-sync
 */
export async function dailySyncJob(): Promise<{
  queued: number;
  errors: string[];
}> {
  console.log("[Cron] Starting daily sync job...");

  // Clean up expired auth data before syncing
  await cleanupExpiredAuthData().catch((err) =>
    console.error("[Cron] Auth cleanup failed:", err)
  );

  // API-capable platforms only. TikTok and Instagram are pushed by the
  // remote scrape host via /api/sync/ingest — queueing them here only
  // produced a false "failed" sync log every day (the server either
  // skips IG for having no session, or gets blocked by TikTok).
  const accounts = await prisma.socialAccount.findMany({
    where: { isActive: true, platform: { in: ["youtube", "twitter", "vk"] } },
    select: { id: true, accountName: true, platform: true },
  });

  console.log(`[Cron] Found ${accounts.length} active API-platform accounts to sync`);

  let queued = 0;
  const errors: string[] = [];

  for (const account of accounts) {
    try {
      await queueSync(account.id, "daily_update");
      queued++;
      console.log(
        `[Cron] Queued sync for ${account.platform}:${account.accountName}`
      );
    } catch (err) {
      const msg = `Failed to queue ${account.accountName}: ${err}`;
      console.error(`[Cron] ${msg}`);
      errors.push(msg);
    }
  }

  console.log(
    `[Cron] Daily sync job complete: ${queued} queued, ${errors.length} errors`
  );

  return { queued, errors };
}
