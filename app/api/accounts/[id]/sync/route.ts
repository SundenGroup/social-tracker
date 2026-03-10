import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { queueSync } from "@/lib/workers/sync-worker";
import { NotFoundError } from "@/lib/errors";

// POST /api/accounts/[id]/sync - Manually trigger sync
export const POST = apiHandler(
  async (req, session) => {
    const id = req.url.split("/accounts/")[1]?.split("/sync")[0];

    const account = await prisma.socialAccount.findFirst({
      where: {
        id,
        organizationId: session!.user.organizationId,
      },
    });

    if (!account) {
      throw new NotFoundError("Account not found");
    }

    try {
      const syncLogId = await queueSync(account.id, "manual_trigger");

      return NextResponse.json({
        data: {
          syncLogId,
          status: "queued",
          message: `Sync queued for ${account.accountName}`,
        },
      });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Failed to queue sync",
        },
        { status: 409 }
      );
    }
  },
  { requireAuth: true, requireAdmin: true }
);
