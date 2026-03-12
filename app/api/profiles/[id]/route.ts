import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validators";
import { NotFoundError } from "@/lib/errors";

// GET /api/profiles/[id]
export const GET = apiHandler(
  async (req, session) => {
    const id = req.url.split("/profiles/")[1]?.split("?")[0];

    const profile = await prisma.profile.findFirst({
      where: { id, organizationId: session!.user.organizationId },
      include: { _count: { select: { socialAccounts: true } } },
    });

    if (!profile) {
      throw new NotFoundError("Profile not found");
    }

    return NextResponse.json({
      data: {
        id: profile.id,
        name: profile.name,
        isDefault: profile.isDefault,
        organizationId: profile.organizationId,
        accountCount: profile._count.socialAccounts,
        createdAt: profile.createdAt.toISOString(),
      },
    });
  },
  { requireAuth: true }
);

// PUT /api/profiles/[id] - Rename profile
export const PUT = apiHandler(
  async (req, session) => {
    const id = req.url.split("/profiles/")[1]?.split("?")[0];
    const orgId = session!.user.organizationId;

    const existing = await prisma.profile.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      throw new NotFoundError("Profile not found");
    }

    const body = await req.json();
    const result = profileSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    // Check for duplicate name
    if (result.data.name !== existing.name) {
      const duplicate = await prisma.profile.findUnique({
        where: { organizationId_name: { organizationId: orgId, name: result.data.name } },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "A profile with this name already exists" },
          { status: 409 }
        );
      }
    }

    const profile = await prisma.profile.update({
      where: { id },
      data: { name: result.data.name },
      include: { _count: { select: { socialAccounts: true } } },
    });

    return NextResponse.json({
      data: {
        id: profile.id,
        name: profile.name,
        isDefault: profile.isDefault,
        organizationId: profile.organizationId,
        accountCount: profile._count.socialAccounts,
        createdAt: profile.createdAt.toISOString(),
      },
    });
  },
  { requireAuth: true, requireAdmin: true }
);

// DELETE /api/profiles/[id]
export const DELETE = apiHandler(
  async (req, session) => {
    const id = req.url.split("/profiles/")[1]?.split("?")[0];
    const orgId = session!.user.organizationId;

    const existing = await prisma.profile.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      throw new NotFoundError("Profile not found");
    }

    if (existing.isDefault) {
      return NextResponse.json(
        { error: "Cannot delete the default profile" },
        { status: 400 }
      );
    }

    // Reassign accounts to the default profile
    const defaultProfile = await prisma.profile.findFirst({
      where: { organizationId: orgId, isDefault: true },
    });

    if (defaultProfile) {
      await prisma.socialAccount.updateMany({
        where: { profileId: id },
        data: { profileId: defaultProfile.id },
      });
    }

    await prisma.profile.delete({ where: { id } });

    return NextResponse.json({ data: { success: true } });
  },
  { requireAuth: true, requireAdmin: true }
);
