import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validators";
import { isScoped } from "@/lib/profile-scope";

// GET /api/profiles - List profiles for organization
// Scoped viewers only see the single profile they have access to, so the
// profile picker and related UI can't hint at siblings they can't open.
//
// Response includes a `platforms: string[]` on each profile (distinct
// platforms for the profile's active connections) plus a top-level
// `orgPlatforms: string[]` union across the whole org (respecting scope)
// — used by the Sidebar to hide Platform nav items that have no content
// in the current profile context.
export const GET = apiHandler(
  async (_req, session) => {
    const orgId = session!.user.organizationId;
    const scoped = isScoped(session!);

    const where: Record<string, unknown> = { organizationId: orgId };
    if (scoped) {
      where.id = session!.user.profileId;
    }

    const profiles = await prisma.profile.findMany({
      where,
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { socialAccounts: true } },
        socialAccounts: {
          where: { isActive: true },
          select: { platform: true },
        },
      },
    });

    const data = profiles.map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      organizationId: p.organizationId,
      accountCount: p._count.socialAccounts,
      platforms: Array.from(new Set(p.socialAccounts.map((a) => a.platform))),
      createdAt: p.createdAt.toISOString(),
    }));

    // Org-wide distinct platforms, respecting the viewer's scope. Used
    // when "All profiles" is selected in the picker (or when the caller
    // has no profile context yet). Also includes unprofiled accounts.
    const orgAccountsWhere: Record<string, unknown> = {
      organizationId: orgId,
      isActive: true,
    };
    if (scoped) {
      orgAccountsWhere.profileId = session!.user.profileId;
    }
    const orgAccounts = await prisma.socialAccount.findMany({
      where: orgAccountsWhere,
      select: { platform: true },
      distinct: ["platform"],
    });
    const orgPlatforms = orgAccounts.map((a) => a.platform);

    return NextResponse.json({ data, orgPlatforms });
  },
  { requireAuth: true }
);

// POST /api/profiles - Create profile
export const POST = apiHandler(
  async (req, session) => {
    const body = await req.json();
    const result = profileSchema.safeParse(body);

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

    const orgId = session!.user.organizationId;

    // Check for duplicate name
    const existing = await prisma.profile.findUnique({
      where: { organizationId_name: { organizationId: orgId, name: result.data.name } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A profile with this name already exists" },
        { status: 409 }
      );
    }

    const profile = await prisma.profile.create({
      data: {
        organizationId: orgId,
        name: result.data.name,
      },
    });

    return NextResponse.json({
      data: {
        id: profile.id,
        name: profile.name,
        isDefault: profile.isDefault,
        organizationId: profile.organizationId,
        accountCount: 0,
        createdAt: profile.createdAt.toISOString(),
      },
    }, { status: 201 });
  },
  { requireAuth: true, requireAdmin: true }
);
