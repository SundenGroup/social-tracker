import type { Session } from "next-auth";

/**
 * Determine which profile(s) a dashboard query should be scoped to.
 *
 * Rules:
 *   - Admins are never restricted. If they pass `?profile=<id>` we honor
 *     exactly that; otherwise we return [] meaning "all profiles in the org".
 *   - A viewer with one or more `profileIds` in their session is hard-
 *     restricted to that set. If they pass `?profile=<id>` and that id is
 *     one of their scopes, we narrow further to just that one. If they pass
 *     an id outside their scope we silently ignore it (security: no peeking
 *     at sibling profiles by URL-tweaking).
 *   - A viewer with zero scopes acts like an admin on this axis.
 *
 * Returns an array of profile ids the server should filter by. An empty
 * array means "no profile filter" (org-wide). Non-empty array means
 * "filter to this set".
 */
export function effectiveProfileIds(
  session: Session,
  requested?: string | null
): string[] {
  const scoped = session.user.profileIds ?? [];

  // Admins: honor the requested filter, or no filter at all.
  if (session.user.role === "admin") {
    return requested ? [requested] : [];
  }

  // Unscoped viewer: same as admin on this axis.
  if (scoped.length === 0) {
    return requested ? [requested] : [];
  }

  // Scoped viewer + requested id that's in their scope → narrow to that one.
  if (requested && scoped.includes(requested)) return [requested];

  // Scoped viewer without a valid request → return their full scope set.
  return scoped;
}

/** True when the caller is restricted to a subset of their org's profiles. */
export function isScoped(session: Session): boolean {
  if (session.user.role === "admin") return false;
  return (session.user.profileIds ?? []).length > 0;
}

/**
 * Turn the effectiveProfileIds result into a Prisma `where`-fragment for
 * filtering by profileId. Callers spread this into their where clause.
 *
 * Examples:
 *   [] → {} (no filter)
 *   ["abc"] → { profileId: "abc" }
 *   ["abc","def"] → { profileId: { in: ["abc","def"] } }
 */
export function profileIdsWhere(ids: string[]): Record<string, unknown> {
  if (ids.length === 0) return {};
  if (ids.length === 1) return { profileId: ids[0] };
  return { profileId: { in: ids } };
}
