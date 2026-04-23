import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";

// GET /api/users/[id]
export const GET = apiHandler(
  async (req, session) => {
    const id = new URL(req.url).pathname.split("/").pop()!;
    const orgId = session!.user.organizationId;

    const user = await prisma.user.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        profileId: true,
        profile: { select: { name: true } },
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundError("User not found");

    return NextResponse.json({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        profileId: user.profileId,
        profileName: user.profile?.name ?? null,
        createdAt: user.createdAt.toISOString(),
      },
    });
  },
  { requireAuth: true, requireAdmin: true }
);

// PUT /api/users/[id]
export const PUT = apiHandler(
  async (req, session) => {
    const id = new URL(req.url).pathname.split("/").pop()!;
    const orgId = session!.user.organizationId;
    const body = await req.json();
    const { name, role, isActive, profileId: rawProfileId } = body as {
      name?: string;
      role?: string;
      isActive?: boolean;
      profileId?: string | null;
    };

    // Verify user belongs to org
    const existing = await prisma.user.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("User not found");

    // Prevent self-demotion
    if (id === session!.user.id && role && role !== "admin") {
      throw new ValidationError("Cannot change your own role");
    }

    if (id === session!.user.id && isActive === false) {
      throw new ValidationError("Cannot deactivate your own account");
    }

    if (role && !["admin", "viewer"].includes(role)) {
      throw new ValidationError("Role must be admin or viewer");
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (role !== undefined) data.role = role;
    if (isActive !== undefined) data.isActive = isActive;

    // Profile scope: only meaningful on viewers. Promoting to admin wipes scope.
    const effectiveRole = (role ?? existing.role) as "admin" | "viewer";
    if (effectiveRole === "admin") {
      // Whenever the user will be (or stay) an admin, clear any scope.
      if (existing.profileId !== null || rawProfileId !== undefined) {
        data.profileId = null;
      }
    } else if (rawProfileId !== undefined) {
      // Viewer with a provided scope — validate and apply.
      if (rawProfileId == null || rawProfileId === "" || rawProfileId === "all") {
        data.profileId = null;
      } else if (typeof rawProfileId === "string") {
        const profile = await prisma.profile.findFirst({
          where: { id: rawProfileId, organizationId: orgId },
          select: { id: true },
        });
        if (!profile) throw new ValidationError("Profile not found in this organization");
        data.profileId = profile.id;
      } else {
        throw new ValidationError("Invalid profile");
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        profileId: true,
        profile: { select: { name: true } },
        createdAt: true,
      },
    });

    return NextResponse.json({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        profileId: user.profileId,
        profileName: user.profile?.name ?? null,
        createdAt: user.createdAt.toISOString(),
      },
    });
  },
  { requireAuth: true, requireAdmin: true }
);

// DELETE /api/users/[id] - Soft delete
export const DELETE = apiHandler(
  async (req, session) => {
    const id = new URL(req.url).pathname.split("/").pop()!;
    const orgId = session!.user.organizationId;

    if (id === session!.user.id) {
      throw new ValidationError("Cannot delete your own account");
    }

    const existing = await prisma.user.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("User not found");

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ data: { success: true } });
  },
  { requireAuth: true, requireAdmin: true }
);
