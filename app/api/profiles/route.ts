import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validators";

// GET /api/profiles - List profiles for organization
export const GET = apiHandler(
  async (_req, session) => {
    const profiles = await prisma.profile.findMany({
      where: { organizationId: session!.user.organizationId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { socialAccounts: true } },
      },
    });

    const data = profiles.map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      organizationId: p.organizationId,
      accountCount: p._count.socialAccounts,
      createdAt: p.createdAt.toISOString(),
    }));

    return NextResponse.json({ data });
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
