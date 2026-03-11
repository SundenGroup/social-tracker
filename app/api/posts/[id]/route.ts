import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";

// PATCH /api/posts/[id] - Toggle post properties (e.g. isSponsored)
export const PATCH = apiHandler(
  async (req, session) => {
    const url = new URL(req.url);
    const id = url.pathname.split("/").pop()!;
    const body = await req.json();

    const orgId = session!.user.organizationId;

    // Verify the post belongs to the user's org
    const post = await prisma.post.findFirst({
      where: {
        id,
        socialAccount: { organizationId: orgId },
      },
      select: { id: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const updated = await prisma.post.update({
      where: { id },
      data: {
        ...(typeof body.isSponsored === "boolean" && {
          isSponsored: body.isSponsored,
        }),
      },
      select: { id: true, isSponsored: true },
    });

    return NextResponse.json({ data: updated });
  },
  { requireAuth: true }
);
