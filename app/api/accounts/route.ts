import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { socialAccountSchema } from "@/lib/validators";
import { encrypt } from "@/lib/api-keys";

// GET /api/accounts - List accounts for organization
export const GET = apiHandler(
  async (_req, session) => {
    const accounts = await prisma.socialAccount.findMany({
      where: { organizationId: session!.user.organizationId },
      orderBy: { createdAt: "desc" },
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

    return NextResponse.json({ data: accounts });
  },
  { requireAuth: true, requireAdmin: true }
);

// POST /api/accounts - Create new account
export const POST = apiHandler(
  async (req, session) => {
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

    // Check for duplicate account
    const existing = await prisma.socialAccount.findUnique({
      where: {
        organizationId_platform_accountId: {
          organizationId: session!.user.organizationId,
          platform,
          accountId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this platform and ID already exists" },
        { status: 409 }
      );
    }

    const account = await prisma.socialAccount.create({
      data: {
        organizationId: session!.user.organizationId,
        platform,
        accountId,
        accountName,
        contentFilter,
        apiKey: apiKey ? encrypt(apiKey) : null,
        authToken: authToken ? encrypt(authToken) : null,
        refreshToken: refreshToken ? encrypt(refreshToken) : null,
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

    return NextResponse.json({ data: account }, { status: 201 });
  },
  { requireAuth: true, requireAdmin: true }
);
