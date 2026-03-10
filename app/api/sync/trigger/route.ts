import { NextResponse } from "next/server";
import { dailySyncJob } from "@/lib/tasks/cron-jobs";

// POST /api/sync/trigger - Cron-triggered daily sync
export async function POST(req: Request) {
  // Validate cron secret token
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET_TOKEN;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const result = await dailySyncJob();

    return NextResponse.json({
      status: "triggered",
      accountsQueued: result.queued,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Sync Trigger] Error:", error);
    return NextResponse.json(
      { error: "Failed to trigger sync" },
      { status: 500 }
    );
  }
}
