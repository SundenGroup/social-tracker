import type { Session } from "next-auth";

/**
 * Determine which profile a dashboard query should be scoped to.
 *
 * Rules:
 *   - Admins are never restricted — we honor whatever profile they requested
 *     via querystring (or null = "all profiles in the org").
 *   - A viewer with `session.user.profileId` set is hard-restricted to that
 *     profile. The requested querystring is ignored — they cannot peek at
 *     sibling profiles by URL-tweaking.
 *   - A viewer without a profile scope acts like an admin on this axis.
 *
 * `requested` is what the client sent (typically `?profile=<id>` or null).
 * Returns the profile id the server should filter by, or null for "all".
 */
export function effectiveProfileId(
  session: Session,
  requested?: string | null
): string | null {
  if (session.user.role === "admin") {
    return requested ?? null;
  }
  const scoped = session.user.profileId;
  if (scoped) return scoped;
  return requested ?? null;
}

/** True when the caller is restricted to a single profile. */
export function isScoped(session: Session): boolean {
  return session.user.role !== "admin" && !!session.user.profileId;
}
