import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validators";
import { isScoped } from "@/lib/profile-scope";
import { Prisma } from "@prisma/client";

// GET /api/profiles - List profiles for organization
// Scoped viewers only see the profiles they have access to, so the
// profile picker and related UI can't hint at siblings they can't open.
//
// Response includes a `platforms: string[]` on each profile (distinct
// platforms for the profile's active connections) plus a top-level
// `orgPlatforms: string[]` union across the whole org (respecting scope)
// — used by the Sidebar to hide Platform nav items that have no content
// in the current profile context.
export const GET = apiHandler(
  async (_req, session) => {
    const orgId = session!.user.organizationId;
    const scoped = isScoped(session!);
    const viewerProfileIds = session!.user.profileIds ?? [];

    const where: Record<string, unknown> = { organizationId: orgId };
    if (scoped) {
      where.id = viewerProfileIds.length === 1
        ? viewerProfileIds[0]
        : { in: viewerProfileIds };
    }

    const profiles = await prisma.profile.findMany({
      where,
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { socialAccounts: true } },
        socialAccounts: {
          where: { isActive: true },
          select: { id: true, platform: true },
        },
      },
    });

    // Per-profile available tags. Cheap because each profile has a
    // small account count and `tags` is GIN-indexed. Returns the
    // distinct lowercase tag list across all (non-deleted) posts on
    // the profile's accounts. Also computes `hasUntaggedPosts` (does
    // any post in the scope have an empty tags array?) — drives the
    // tag-filter UI decision: when there's a single tag with 100%
    // coverage, the toggle does nothing useful and gets hidden client-side.
    const tagsByProfile = new Map<string, string[]>();
    const hasUntaggedByProfile = new Map<string, boolean>();
    for (const p of profiles) {
      const accountIds = p.socialAccounts.map((a) => a.id);
      if (accountIds.length === 0) {
        tagsByProfile.set(p.id, []);
        hasUntaggedByProfile.set(p.id, false);
        continue;
      }
      try {
        const rows = await prisma.$queryRaw<Array<{ tag: string }>>(
          Prisma.sql`
            SELECT DISTINCT unnest(tags) AS tag
            FROM "Post"
            WHERE "socialAccountId" IN (${Prisma.join(accountIds)})
              AND "isDeleted" = false
            ORDER BY tag ASC
          `
        );
        tagsByProfile.set(p.id, rows.map((r) => r.tag).filter(Boolean));
      } catch {
        tagsByProfile.set(p.id, []);
      }
      try {
        // EXISTS short-circuits at the first hit — sub-millisecond even
        // for 100K-row profiles.
        const untaggedRows = await prisma.$queryRaw<Array<{ has_untagged: boolean }>>(
          Prisma.sql`
            SELECT EXISTS(
              SELECT 1 FROM "Post"
              WHERE "socialAccountId" IN (${Prisma.join(accountIds)})
                AND "isDeleted" = false
                AND tags = ARRAY[]::TEXT[]
            ) AS has_untagged
          `
        );
        hasUntaggedByProfile.set(p.id, untaggedRows[0]?.has_untagged ?? false);
      } catch {
        // Conservative default: assume untagged exists, so the strip
        // shows. Better to over-show than under-show on transient errors.
        hasUntaggedByProfile.set(p.id, true);
      }
    }

    const data = profiles.map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      organizationId: p.organizationId,
      accountCount: p._count.socialAccounts,
      platforms: Array.from(new Set(p.socialAccounts.map((a) => a.platform))),
      tags: tagsByProfile.get(p.id) ?? [],
      hasUntaggedPosts: hasUntaggedByProfile.get(p.id) ?? true,
      createdAt: p.createdAt.toISOString(),
    }));

    // Org-wide distinct platforms + tags, respecting the viewer's scope.
    // Used when "All profiles" is selected in the picker (or when the
    // caller has no profile context yet). Also includes unprofiled
    // accounts.
    const orgAccountsWhere: Record<string, unknown> = {
      organizationId: orgId,
      isActive: true,
    };
    if (scoped) {
      orgAccountsWhere.profileId = viewerProfileIds.length === 1
        ? viewerProfileIds[0]
        : { in: viewerProfileIds };
    }
    const orgAccounts = await prisma.socialAccount.findMany({
      where: orgAccountsWhere,
      select: { id: true, platform: true },
      distinct: ["platform"],
    });
    const orgPlatforms = Array.from(new Set(orgAccounts.map((a) => a.platform)));

    // Org-wide tag list = union of every profile's tags + any tags on
    // unprofiled accounts the viewer can see. Quick set-merge.
    const orgTagSet = new Set<string>();
    for (const list of tagsByProfile.values()) {
      for (const t of list) orgTagSet.add(t);
    }
    const orgTags = Array.from(orgTagSet).sort();

    // Org-wide "any untagged?" — true if ANY profile has an untagged
    // post. Only relevant when the user is on "All profiles" view.
    const orgHasUntaggedPosts = Array.from(hasUntaggedByProfile.values()).some(Boolean);

    return NextResponse.json({ data, orgPlatforms, orgTags, orgHasUntaggedPosts });
  },
  { requireAuth: true }
);

// POST /api/profiles - Create profile
export const POST = apiHandler(
  async (req, session) => {
    const body = await req.json();
    const result = profileSchema.safeParse(body);

    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const field = issue.path.join(".");
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }
      return NextResponse.json(
        { error: "Validation failed", details: fieldErrors },
        { status: 400 }
      );
    }

    const orgId = session!.user.organizationId;

    // Check for duplicate name
    const existing = await prisma.profile.findUnique({
      where: { organizationId_name: { organizationId: orgId, name: result.data.name } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A profile with this name already exists" },
        { status: 409 }
      );
    }

    const profile = await prisma.profile.create({
      data: {
        organizationId: orgId,
        name: result.data.name,
      },
    });

    return NextResponse.json({
      data: {
        id: profile.id,
        name: profile.name,
        isDefault: profile.isDefault,
        organizationId: profile.organizationId,
        accountCount: 0,
        createdAt: profile.createdAt.toISOString(),
      },
    }, { status: 201 });
  },
  { requireAuth: true, requireAdmin: true }
);
