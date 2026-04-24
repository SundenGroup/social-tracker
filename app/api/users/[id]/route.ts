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
        profileScopes: {
          select: { profile: { select: { id: true, name: true } } },
        },
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
        profileIds: user.profileScopes.map((s) => s.profile.id),
        profileNames: user.profileScopes.map((s) => s.profile.name),
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
    const { name, role, isActive, profileIds: rawProfileIds, profileId: rawProfileId } = body as {
      name?: string;
      role?: string;
      isActive?: boolean;
      profileIds?: string[];
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

    // Profile scopes: only meaningful on viewers. Promoting to admin wipes scopes.
    const effectiveRole = (role ?? existing.role) as "admin" | "viewer";
    let nextScopes: string[] | null = null; // null = don't touch
    if (effectiveRole === "admin") {
      // Whenever the user will be (or stay) an admin, clear any scope.
      nextScopes = [];
    } else if (rawProfileIds !== undefined || rawProfileId !== undefined) {
      // Caller explicitly sent new scopes — validate and replace.
      const list = Array.isArray(rawProfileIds)
        ? rawProfileIds.filter((x) => typeof x === "string")
        : typeof rawProfileId === "string" && rawProfileId !== "" && rawProfileId !== "all"
          ? [rawProfileId]
          : [];
      const deduped = Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)));
      if (deduped.length === 0) {
        nextScopes = [];
      } else {
        const profiles = await prisma.profile.findMany({
          where: { id: { in: deduped }, organizationId: orgId },
          select: { id: true },
        });
        if (profiles.length !== deduped.length) {
          throw new ValidationError("One or more profiles not found in this organization");
        }
        nextScopes = profiles.map((p) => p.id);
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data,
        select: {
          id: true, name: true, email: true, role: true, isActive: true, createdAt: true,
        },
      });
      if (nextScopes !== null) {
        await tx.userProfileScope.deleteMany({ where: { userId: id } });
        if (nextScopes.length > 0) {
          await tx.userProfileScope.createMany({
            data: nextScopes.map((pid) => ({ userId: id, profileId: pid })),
          });
        }
      }
      const scopes = await tx.userProfileScope.findMany({
        where: { userId: id },
        select: { profile: { select: { id: true, name: true } } },
      });
      return { ...u, scopes };
    });

    return NextResponse.json({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        profileIds: user.scopes.map((s) => s.profile.id),
        profileNames: user.scopes.map((s) => s.profile.name),
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
