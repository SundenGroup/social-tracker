import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { socialAccountSchema } from "@/lib/validators";
import { encrypt } from "@/lib/api-keys";
import { NotFoundError } from "@/lib/errors";

// GET /api/accounts/[id] - Get account details
export const GET = apiHandler(
  async (_req, session) => {
    const id = _req.url.split("/accounts/")[1]?.split("?")[0];

    const account = await prisma.socialAccount.findFirst({
      where: {
        id,
        organizationId: session!.user.organizationId,
      },
      select: {
        id: true,
        platform: true,
        accountId: true,
        accountName: true,
        contentFilter: true,
        isActive: true,
        lastSyncedAt: true,
        syncStatus: true,
        createdAt: true,
      },
    });

    if (!account) {
      throw new NotFoundError("Account not found");
    }

    return NextResponse.json({ data: account });
  },
  { requireAuth: true }
);

// PUT /api/accounts/[id] - Update account
export const PUT = apiHandler(
  async (req, session) => {
    const id = req.url.split("/accounts/")[1]?.split("?")[0];

    const existing = await prisma.socialAccount.findFirst({
      where: {
        id,
        organizationId: session!.user.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Account not found");
    }

    const body = await req.json();
    const result = socialAccountSchema.safeParse(body);

    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const field = issue.path.join(".");
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }
      return NextResponse.json(
        { error: "Validation failed", details: fieldErrors },
        { status: 400 }
      );
    }

    const { platform, accountId, accountName, contentFilter, apiKey, authToken, refreshToken } =
      result.data;

    // Check for duplicate if platform/accountId changed
    if (platform !== existing.platform || accountId !== existing.accountId) {
      const duplicate = await prisma.socialAccount.findUnique({
        where: {
          organizationId_platform_accountId: {
            organizationId: session!.user.organizationId,
            platform,
            accountId,
          },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: "An account with this platform and ID already exists" },
          { status: 409 }
        );
      }
    }

    const account = await prisma.socialAccount.update({
      where: { id },
      data: {
        platform,
        accountId,
        accountName,
        contentFilter,
        ...(apiKey !== undefined && {
          apiKey: apiKey ? encrypt(apiKey) : null,
        }),
        ...(authToken !== undefined && {
          authToken: authToken ? encrypt(authToken) : null,
        }),
        ...(refreshToken !== undefined && {
          refreshToken: refreshToken ? encrypt(refreshToken) : null,
        }),
      },
      select: {
        id: true,
        platform: true,
        accountId: true,
        accountName: true,
        contentFilter: true,
        isActive: true,
        lastSyncedAt: true,
        syncStatus: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: account });
  },
  { requireAuth: true, requireAdmin: true }
);

// DELETE /api/accounts/[id] - Delete account
export const DELETE = apiHandler(
  async (req, session) => {
    const id = req.url.split("/accounts/")[1]?.split("?")[0];

    const existing = await prisma.socialAccount.findFirst({
      where: {
        id,
        organizationId: session!.user.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Account not found");
    }

    await prisma.socialAccount.delete({ where: { id } });

    return NextResponse.json({ data: { success: true } });
  },
  { requireAuth: true, requireAdmin: true }
);
