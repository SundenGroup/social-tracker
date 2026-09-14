import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { effectiveProfileIds } from "@/lib/profile-scope";

// POST /api/share { title?, startDate, endDate, profileId? }
// Creates a public, tokenized, read-only report link. The data is
// computed live at view time by GET /api/share/[token].
export const POST = apiHandler(
  async (req, session) => {
    const body = await req.json().catch(() => ({}));
    const start = new Date(`${body.startDate}T00:00:00.000Z`);
    const end = new Date(`${body.endDate}T23:59:59.999Z`);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return NextResponse.json({ error: "Valid startDate and endDate are required" }, { status: 400 });
    }

    // Resolve the requested profiles through the caller's permission
    // set — a scoped viewer can only share what they can see. Accepts
    // the full multi-select (`profileIds` array) and the legacy single
    // `profileId` string.
    const requested: string[] | string | null = Array.isArray(body.profileIds)
      ? body.profileIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
      : typeof body.profileId === "string" && body.profileId
        ? body.profileId
        : null;
    const scopeIds = effectiveProfileIds(session!, requested);

    // Keep only profiles that really belong to this org, and get their
    // names for the default title.
    const profiles =
      scopeIds.length > 0
        ? await prisma.profile.findMany({
            where: { id: { in: scopeIds }, organizationId: session!.user.organizationId },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : [];
    const profileIds = profiles.map((p) => p.id);

    const scopeLabel =
      profileIds.length === 0
        ? "All profiles"
        : profiles.length <= 2
          ? profiles.map((p) => p.name).join(" + ")
          : `${profiles.length} profiles`;
    const fallbackTitle = `${scopeLabel} — ${body.startDate} to ${body.endDate}`;
    const title =
      typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : fallbackTitle;

    const report = await prisma.sharedReport.create({
      data: {
        token: randomBytes(16).toString("hex"),
        organizationId: session!.user.organizationId,
        createdById: session!.user.id,
        title,
        profileIds,
        startDate: start,
        endDate: end,
      },
    });

    return NextResponse.json({ data: { token: report.token, url: `/share/${report.token}` } });
  },
  { requireAuth: true }
);
