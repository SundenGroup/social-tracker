import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";

// DELETE /api/saved-views/:id — own views only
export const DELETE = apiHandler(
  async (req, session) => {
    const id = new URL(req.url).pathname.split("/").pop()!;
    const deleted = await prisma.savedView.deleteMany({
      where: { id, userId: session!.user.id },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { ok: true } });
  },
  { requireAuth: true }
);
