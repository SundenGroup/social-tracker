import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";

// GET /api/settings
export const GET = apiHandler(
  async (_req, session) => {
    const orgId = session!.user.organizationId;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { hideSponsored: true },
    });

    return NextResponse.json({ data: { hideSponsored: org?.hideSponsored ?? false } });
  },
  { requireAuth: true }
);

// PATCH /api/settings
export const PATCH = apiHandler(
  async (req, session) => {
    const orgId = session!.user.organizationId;
    const body = await req.json();

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: { hideSponsored: Boolean(body.hideSponsored) },
      select: { hideSponsored: true },
    });

    return NextResponse.json({ data: { hideSponsored: updated.hideSponsored } });
  },
  { requireAuth: true }
);
