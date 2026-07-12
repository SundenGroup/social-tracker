import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";

// GET /api/saved-views — the caller's bookmarks
export const GET = apiHandler(
  async (_req, session) => {
    const views = await prisma.savedView.findMany({
      where: { userId: session!.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json({ data: views });
  },
  { requireAuth: true }
);

// POST /api/saved-views { name, url }
export const POST = apiHandler(
  async (req, session) => {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!name || !url.startsWith("/") || url.length > 2000) {
      return NextResponse.json({ error: "A name and an app-relative URL are required" }, { status: 400 });
    }
    const count = await prisma.savedView.count({ where: { userId: session!.user.id } });
    if (count >= 30) {
      return NextResponse.json({ error: "Saved-view limit reached (30) — delete one first" }, { status: 400 });
    }
    const view = await prisma.savedView.create({
      data: { userId: session!.user.id, name, url },
    });
    return NextResponse.json({ data: view });
  },
  { requireAuth: true }
);
