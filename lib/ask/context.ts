import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { effectiveProfileIds, profileIdsWhere } from "@/lib/profile-scope";

/**
 * Everything an Ask tool executor needs, resolved server-side from the
 * session BEFORE the model sees anything. Tools close over this — the
 * model can never widen it. The only model-controlled narrowing is
 * `profile_name`, which resolves strictly against `visibleProfiles`
 * (the user's full permission set) and errors on anything else.
 */
export interface AskContext {
  orgId: string;
  userId: string;
  /** Accounts in the CURRENT scope (org + active + selected profiles). */
  accounts: Array<{ id: string; platform: string; profileId: string | null; accountName: string }>;
  /** All profiles this user is ALLOWED to see (for profile_name resolution). */
  visibleProfiles: Array<{ id: string; name: string }>;
  /** Human-readable description of the current scope for the answer footer. */
  scopeLabel: string;
  platforms: string[];
  availableTags: string[];
  hideSponsored: boolean;
  followerTrackingSince: string | null;
  earliestPost: string | null;
  today: string;
}

export async function buildAskContext(
  session: Session,
  requestedProfileIds?: string | null
): Promise<AskContext> {
  const orgId = session.user.organizationId;
  const scopeIds = effectiveProfileIds(session, requestedProfileIds);

  const allowedProfileWhere =
    session.user.role !== "admin" && (session.user.profileIds ?? []).length > 0
      ? { id: { in: session.user.profileIds } }
      : {};

  const [visibleProfiles, accounts, org] = await Promise.all([
    prisma.profile.findMany({
      where: { organizationId: orgId, ...allowedProfileWhere },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.socialAccount.findMany({
      where: { organizationId: orgId, isActive: true, ...profileIdsWhere(scopeIds) },
      select: { id: true, platform: true, profileId: true, accountName: true },
    }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { hideSponsored: true } }),
  ]);

  const accountIds = accounts.map((a) => a.id);

  const [tagRows, firstRollup, firstPost] = await Promise.all([
    accountIds.length > 0
      ? prisma.$queryRaw<Array<{ tag: string; n: bigint }>>`
          SELECT unnest(tags) AS tag, COUNT(*) AS n
          FROM "Post"
          WHERE "socialAccountId" = ANY(${accountIds}) AND "isDeleted" = false
          GROUP BY 1 ORDER BY 2 DESC LIMIT 40`
      : Promise.resolve([]),
    prisma.accountDailyRollup.findFirst({
      where: { socialAccountId: { in: accountIds } },
      orderBy: { rollupDate: "asc" },
      select: { rollupDate: true },
    }),
    prisma.post.findFirst({
      where: { socialAccountId: { in: accountIds }, isDeleted: false },
      orderBy: { publishedAt: "asc" },
      select: { publishedAt: true },
    }),
  ]);

  const scopedNames = visibleProfiles.filter((p) => scopeIds.includes(p.id)).map((p) => p.name);
  const scopeLabel =
    scopedNames.length > 0 ? scopedNames.join(", ") : "All profiles";

  return {
    orgId,
    userId: session.user.id,
    accounts,
    visibleProfiles,
    scopeLabel,
    platforms: Array.from(new Set(accounts.map((a) => a.platform))),
    availableTags: tagRows.map((r) => r.tag),
    hideSponsored: org?.hideSponsored ?? false,
    followerTrackingSince: firstRollup ? firstRollup.rollupDate.toISOString().slice(0, 10) : null,
    earliestPost: firstPost ? firstPost.publishedAt.toISOString().slice(0, 10) : null,
    today: new Date().toISOString().slice(0, 10),
  };
}
