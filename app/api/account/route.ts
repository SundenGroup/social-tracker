import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { ValidationError, NotFoundError } from "@/lib/errors";

/**
 * GET /api/account — current user's own profile. Any authenticated user.
 */
export const GET = apiHandler(
  async (_req, session) => {
    const user = await prisma.user.findUnique({
      where: { id: session!.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        organization: { select: { name: true } },
      },
    });
    if (!user) throw new NotFoundError("Account not found");
    return NextResponse.json({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationName: user.organization.name,
      },
    });
  },
  { requireAuth: true }
);

/**
 * PATCH /api/account — update the current user's own name.
 * Email and role changes deliberately not allowed here:
 *   - email is the login identifier and changing it needs re-verification (future)
 *   - role changes are always admin-on-admin via /api/users/[id]
 */
export const PATCH = apiHandler(
  async (req, session) => {
    const body = await req.json();
    const update: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (trimmed.length < 1) throw new ValidationError("Name can't be empty");
      if (trimmed.length > 100) throw new ValidationError("Name is too long");
      update.name = trimmed;
    }

    if (Object.keys(update).length === 0) {
      throw new ValidationError("No changes to save");
    }

    const user = await prisma.user.update({
      where: { id: session!.user.id },
      data: update,
      select: { id: true, name: true, email: true, role: true },
    });

    return NextResponse.json({ data: user });
  },
  { requireAuth: true }
);
