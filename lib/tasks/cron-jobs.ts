import { prisma } from "@/lib/db";
import { queueSync } from "@/lib/workers/sync-worker";

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

  const accounts = await prisma.socialAccount.findMany({
    where: { isActive: true },
    select: { id: true, accountName: true, platform: true },
  });

  console.log(`[Cron] Found ${accounts.length} active accounts to sync`);

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
