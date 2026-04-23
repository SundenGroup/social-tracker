import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";

// GET /api/settings
export const GET = apiHandler(
  async (_req, session) => {
    const orgId = session!.user.organizationId;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, hideSponsored: true },
    });

    return NextResponse.json({
      data: {
        organizationName: org?.name ?? "",
        hideSponsored: org?.hideSponsored ?? false,
      },
    });
  },
  { requireAuth: true }
);

// PATCH /api/settings
export const PATCH = apiHandler(
  async (req, session) => {
    const orgId = session!.user.organizationId;
    const body = await req.json();

    const update: Record<string, unknown> = {};

    if (typeof body.hideSponsored === "boolean") {
      update.hideSponsored = body.hideSponsored;
    }

    if (typeof body.organizationName === "string") {
      const trimmed = body.organizationName.trim();
      if (trimmed.length < 2) {
        throw new ValidationError("Organization name must be at least 2 characters");
      }
      if (trimmed.length > 80) {
        throw new ValidationError("Organization name must be 80 characters or fewer");
      }
      update.name = trimmed;
    }

    if (Object.keys(update).length === 0) {
      throw new ValidationError("No settings to update");
    }

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: update,
      select: { name: true, hideSponsored: true },
    });

    return NextResponse.json({
      data: {
        organizationName: updated.name,
        hideSponsored: updated.hideSponsored,
      },
    });
  },
  { requireAuth: true, requireAdmin: true }
);
