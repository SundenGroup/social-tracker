import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { socialAccountSchema } from "@/lib/validators";
import { encrypt } from "@/lib/api-keys";
import { NotFoundError } from "@/lib/errors";
import { buildCookiePayload } from "@/lib/utils/browser-cookies";
import { recomputeAccountTags, parseTagRules } from "@/lib/tagging";
import { Prisma } from "@prisma/client";

// GET /api/accounts/[id] - Get account details
export const GET = apiHandler(
  async (_req, session) => {
    const id = _req.url.split("/accounts/")[1]?.split("?")[0];

    const account = await prisma.socialAccount.findFirst({
      where: {
        id,
        organizationId: session!.user.organizationId,
      },
      select: {
        id: true,
        platform: true,
        accountId: true,
        accountName: true,
        contentFilter: true,
        isActive: true,
        lastSyncedAt: true,
        syncStatus: true,
        profileId: true,
        profile: { select: { name: true } },
        createdAt: true,
        defaultTags: true,
        tagRules: true,
      },
    });

    if (!account) {
      throw new NotFoundError("Account not found");
    }

    return NextResponse.json({
      data: {
        ...account,
        profileName: account.profile?.name ?? null,
        profile: undefined,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
        createdAt: account.createdAt.toISOString(),
      },
    });
  },
  { requireAuth: true, requireAdmin: true }
);

// PUT /api/accounts/[id] - Update account
export const PUT = apiHandler(
  async (req, session) => {
    const id = req.url.split("/accounts/")[1]?.split("?")[0];

    const existing = await prisma.socialAccount.findFirst({
      where: {
        id,
        organizationId: session!.user.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Account not found");
    }

    const body = await req.json();
    const result = socialAccountSchema.safeParse(body);

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

    const { platform, accountId, accountName, contentFilter, profileId, apiKey, refreshToken, defaultTags, tagRules } =
      result.data;
    let { authToken } = result.data;

    // Detect whether the tag configuration actually changed; only then
    // do we trigger the post-save recompute. Cheap rough comparison —
    // the recompute is idempotent so a false positive just costs a
    // single pass over the account's posts.
    const prevDefault = (existing.defaultTags ?? []).slice().sort().join(",");
    const nextDefault = (defaultTags ?? []).slice().sort().join(",");
    const prevRules = JSON.stringify(existing.tagRules ?? null);
    const nextRules = JSON.stringify(tagRules ?? null);
    const tagConfigChanged = prevDefault !== nextDefault || prevRules !== nextRules;

    // Validate the rule shape via the engine (canonicalises hashtags
    // and mentions, strips empty rules, etc.). Throws on bad input.
    let canonicalRules: ReturnType<typeof parseTagRules> | null = null;
    if (tagRules !== undefined) {
      try {
        canonicalRules = parseTagRules(tagRules);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Invalid tagRules" },
          { status: 400 }
        );
      }
    }

    // For Instagram/TikTok, convert raw cookie header string to structured JSON
    if (authToken && (platform === "instagram" || platform === "tiktok" || platform === "twitter")) {
      try {
        JSON.parse(authToken);
      } catch {
        authToken = buildCookiePayload(authToken, platform);
      }
    }

    // Check for duplicate if platform/accountId changed
    if (platform !== existing.platform || accountId !== existing.accountId) {
      const duplicate = await prisma.socialAccount.findUnique({
        where: {
          organizationId_platform_accountId: {
            organizationId: session!.user.organizationId,
            platform,
            accountId,
          },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: "An account with this platform and ID already exists" },
          { status: 409 }
        );
      }
    }

    const account = await prisma.socialAccount.update({
      where: { id },
      data: {
        platform,
        accountId,
        accountName,
        contentFilter,
        ...(profileId !== undefined ? { profileId: profileId || null } : {}),
        ...(apiKey !== undefined && {
          apiKey: apiKey ? encrypt(apiKey) : null,
        }),
        ...(authToken !== undefined && {
          authToken: authToken ? encrypt(authToken) : null,
        }),
        ...(refreshToken !== undefined && {
          refreshToken: refreshToken ? encrypt(refreshToken) : null,
        }),
        ...(defaultTags !== undefined && { defaultTags: defaultTags.map((t) => t.trim().toLowerCase()).filter(Boolean) }),
        // Prisma's JSON column accepts InputJsonValue or DbNull; widen
        // the typed TagRule[] through unknown rather than threading
        // Prisma's exact JSON-input types into our pure tagging engine.
        ...(canonicalRules !== null && { tagRules: canonicalRules as unknown as Prisma.InputJsonValue }),
        ...(tagRules === null && { tagRules: Prisma.JsonNull }),
      },
      select: {
        id: true,
        platform: true,
        accountId: true,
        accountName: true,
        contentFilter: true,
        isActive: true,
        lastSyncedAt: true,
        syncStatus: true,
        profileId: true,
        profile: { select: { name: true } },
        createdAt: true,
        defaultTags: true,
        tagRules: true,
      },
    });

    // Recompute tags on every post for this account when the tag
    // configuration changed. Idempotent + chunked, so safe to run
    // synchronously; for very large accounts (10K+ posts) consider
    // moving to a background job later.
    let postsRetagged: number | undefined;
    if (tagConfigChanged) {
      try {
        postsRetagged = await recomputeAccountTags(id);
      } catch (err) {
        // Don't fail the PUT — the new config is saved, ingest will
        // pick up new posts correctly. Surface a non-fatal warning.
        console.error("[accounts PUT] recomputeAccountTags failed:", err);
      }
    }

    return NextResponse.json({
      data: {
        ...account,
        profileName: account.profile?.name ?? null,
        profile: undefined,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
        createdAt: account.createdAt.toISOString(),
        ...(postsRetagged !== undefined && { postsRetagged }),
      },
    });
  },
  { requireAuth: true, requireAdmin: true }
);

// DELETE /api/accounts/[id] - Delete account
export const DELETE = apiHandler(
  async (req, session) => {
    const id = req.url.split("/accounts/")[1]?.split("?")[0];

    const existing = await prisma.socialAccount.findFirst({
      where: {
        id,
        organizationId: session!.user.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Account not found");
    }

    await prisma.socialAccount.delete({ where: { id } });

    return NextResponse.json({ data: { success: true } });
  },
  { requireAuth: true, requireAdmin: true }
);
