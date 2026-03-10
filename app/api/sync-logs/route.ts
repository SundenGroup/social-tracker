import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";

// GET /api/sync-logs - Retrieve sync history
export const GET = apiHandler(
  async (req, session) => {
    const url = new URL(req.url);
    const accountId = url.searchParams.get("accountId");
    const status = url.searchParams.get("status");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 100);
    const offset = Number(url.searchParams.get("offset")) || 0;

    // Ensure user can only see their own org's sync logs
    const orgAccounts = await prisma.socialAccount.findMany({
      where: { organizationId: session!.user.organizationId },
      select: { id: true },
    });
    const orgAccountIds = orgAccounts.map((a) => a.id);

    const where = {
      socialAccountId: {
        in: accountId ? [accountId] : orgAccountIds,
      },
      ...(status && { status: status as "pending" | "syncing" | "success" | "failed" }),
    };

    const [logs, total] = await Promise.all([
      prisma.syncLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          socialAccount: {
            select: { accountName: true, platform: true },
          },
        },
      }),
      prisma.syncLog.count({ where }),
    ]);

    return NextResponse.json({
      data: logs,
      pagination: {
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
  { requireAuth: true }
);
