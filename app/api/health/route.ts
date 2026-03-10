import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/health - Health check for monitoring
export async function GET() {
  const startTime = Date.now();
  let dbHealthy = false;
  let lastSync: string | null = null;

  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;
    dbHealthy = true;

    // Get last successful sync
    const latestSync = await prisma.syncLog.findFirst({
      where: { status: "success" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    });
    lastSync = latestSync?.completedAt?.toISOString() ?? null;
  } catch {
    // DB check failed
  }

  const status = dbHealthy ? "ok" : "error";

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      database: dbHealthy,
      lastSync,
      responseTime: Date.now() - startTime,
      version: "0.1.0",
    },
    { status: dbHealthy ? 200 : 503 }
  );
}
