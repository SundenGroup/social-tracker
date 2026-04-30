import type { Session } from "next-auth";

/**
 * Determine which profile(s) a dashboard query should be scoped to.
 *
 * `requested` may be a single id, an array of ids, a comma-separated
 * string, or null/undefined. Empty / null / undefined means "no
 * narrowing" (the caller wants the full org or full viewer scope).
 *
 * Rules:
 *   - Admins are never restricted. If they pass any requested ids,
 *     honor exactly that set; otherwise return [] (org-wide).
 *   - A viewer with one or more `profileIds` is hard-restricted. We
 *     intersect the requested set with their scope so they can narrow
 *     within their scope but never peek outside. Empty intersection →
 *     fall back to their full scope.
 *   - A viewer with zero scopes acts like an admin on this axis.
 *
 * Returns an array of profile ids the server should filter by. Empty
 * array = no profile filter (all viewer-visible profiles).
 */
export function effectiveProfileIds(
  session: Session,
  requested?: string | string[] | null
): string[] {
  const scoped = session.user.profileIds ?? [];
  const reqIds = normalizeRequested(requested);

  // Admins: honor requested filter as-is (or no filter at all).
  if (session.user.role === "admin") {
    return reqIds;
  }

  // Unscoped viewer: same as admin on this axis.
  if (scoped.length === 0) {
    return reqIds;
  }

  // Scoped viewer: intersect requested with their scope. If the
  // intersection is empty (or no request was made), fall back to the
  // full scope set so they always see SOMETHING they're allowed to.
  if (reqIds.length === 0) return scoped;
  const allowed = reqIds.filter((id) => scoped.includes(id));
  return allowed.length > 0 ? allowed : scoped;
}

/** Coerce the various URL / query shapes for `profileId` into a clean
 *  unique string[]. Strips empties and duplicates. */
function normalizeRequested(input?: string | string[] | null): string[] {
  if (input == null) return [];
  const list = Array.isArray(input) ? input : input.split(",");
  const out = new Set<string>();
  for (const v of list) {
    const s = String(v ?? "").trim();
    if (s) out.add(s);
  }
  return Array.from(out);
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
