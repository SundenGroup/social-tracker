import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { isScoped, profileIdsWhere } from "@/lib/profile-scope";
import { recomputePostTags } from "@/lib/tagging";

// PATCH /api/posts/[id] - Toggle per-post properties (isSponsored,
// manualTags). Used by the per-post popover in the dashboard table.
export const PATCH = apiHandler(
  async (req, session) => {
    const url = new URL(req.url);
    const id = url.pathname.split("/").pop()!;
    const body = await req.json();

    const orgId = session!.user.organizationId;

    // Verify the post belongs to the user's org, not deleted, and — if the
    // caller is scoped to one or more profiles — lives inside that set.
    const accountFilter: Record<string, unknown> = { organizationId: orgId };
    if (isScoped(session!)) {
      Object.assign(accountFilter, profileIdsWhere(session!.user.profileIds ?? []));
    }
    const post = await prisma.post.findFirst({
      where: {
        id,
        isDeleted: false,
        socialAccount: accountFilter,
      },
      select: { id: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Validate manualTags if supplied. Accept any non-empty string array;
    // canonicalise to lowercase + drop blanks. The tag engine takes care
    // of unioning with auto tags during recomputePostTags below.
    let cleanManualTags: string[] | undefined;
    if (body.manualTags !== undefined) {
      if (!Array.isArray(body.manualTags)) {
        return NextResponse.json({ error: "manualTags must be an array of strings" }, { status: 400 });
      }
      cleanManualTags = (body.manualTags as unknown[])
        .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
        .filter((v): v is string => v.length > 0 && v.length <= 50);
      // Dedup
      cleanManualTags = Array.from(new Set(cleanManualTags));
    }

    const updated = await prisma.post.update({
      where: { id },
      data: {
        ...(typeof body.isSponsored === "boolean" && {
          isSponsored: body.isSponsored,
        }),
        ...(cleanManualTags !== undefined && { manualTags: cleanManualTags }),
      },
      select: { id: true, isSponsored: true, manualTags: true, tags: true },
    });

    // If manualTags changed, the effective `tags` array needs a refresh
    // (auto ∪ manual). recomputePostTags reads the post + account, runs
    // the tag engine, writes Post.tags. Single-row, fast.
    if (cleanManualTags !== undefined) {
      try {
        await recomputePostTags(id);
      } catch (err) {
        console.error("[posts PATCH] recomputePostTags failed:", err);
      }
      // Re-read so the caller gets the freshly-computed tags array.
      const refreshed = await prisma.post.findUnique({
        where: { id },
        select: { id: true, isSponsored: true, manualTags: true, tags: true },
      });
      if (refreshed) return NextResponse.json({ data: refreshed });
    }

    return NextResponse.json({ data: updated });
  },
  { requireAuth: true }
);
