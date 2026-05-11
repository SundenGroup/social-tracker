"use client";

import { createContext, useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { ProfileResponse } from "@/types";

interface ProfileContextValue {
  profiles: ProfileResponse[];
  /** Currently-selected profile ids. Empty array = "all profiles" (org-wide
   *  for admins, full viewer scope for scoped viewers). One or more =
   *  intersect filter to that set. The metric endpoints accept this list
   *  joined as `?profileId=a,b,c`. */
  selectedProfileIds: string[];
  /** Replace the selection. Pass `[]` to reset to "all profiles". */
  setSelectedProfileIds: (ids: string[]) => void;
  isLoading: boolean;
  initialized: boolean;
  refetch: () => Promise<void>;
  /**
   * Distinct platforms with at least one active connection in the current
   * scope. Selected = union across selected profiles; empty selection =
   * org-wide. Used by the Sidebar to hide platform nav items with no data.
   */
  activePlatforms: string[];
  /**
   * Distinct tags applied to any non-deleted post in the current scope.
   * Selected = union across selected profiles; empty selection = org-wide
   * union. Drives the dashboard tag-filter strip.
   */
  availableTags: string[];
  /**
   * True if the current scope has at least one post without any tags.
   * Used together with `availableTags` to hide the single-tag toggle pill
   * when the only tag covers 100% of posts.
   */
  hasUntaggedPostsInScope: boolean;
  /**
   * Default tag filter for the current scope, set by any rule marked
   * `alwaysOn`. Picks alphabetically-first when multiple selected profiles
   * disagree. Null when no rule is alwaysOn.
   */
  defaultTagFilter: string | null;
  /**
   * Subset of `availableTags` that should always render as visible
   * chips in the tag-filter strip — account defaultTags plus any rule
   * marked alwaysOn. Other tags are hidden behind a "More tags" menu.
   */
  primaryTags: string[];
  /**
   * Canonical tag → display label (e.g. {pec: "PEC"}). Only contains
   * entries where the display form differs from the canonical lowercase.
   * Renderers fall back to capitalising the canonical tag when absent.
   */
  tagDisplayNames: Record<string, string>;
  /**
   * True once the initial /api/profiles fetch has completed.
   */
  profilesLoaded: boolean;
}

export const ProfileContext = createContext<ProfileContextValue>({
  profiles: [],
  selectedProfileIds: [],
  setSelectedProfileIds: () => {},
  isLoading: false,
  initialized: false,
  refetch: async () => {},
  activePlatforms: [],
  availableTags: [],
  hasUntaggedPostsInScope: true,
  defaultTagFilter: null,
  primaryTags: [],
  tagDisplayNames: {},
  profilesLoaded: false,
});

const STORAGE_KEY = "clutch-selected-profile";

/** Parse a stored selection (legacy single id, comma-separated, or
 *  JSON array) into a clean string[]. */
function parseStoredSelection(raw: string | null): string[] {
  if (!raw) return [];
  // JSON array shape (new format).
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === "string" && x.length > 0);
    } catch {
      /* fall through to comma split */
    }
  }
  // Comma-separated or single id (legacy).
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export default function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [profiles, setProfiles] = useState<ProfileResponse[]>([]);
  const [orgPlatforms, setOrgPlatforms] = useState<string[]>([]);
  const [orgTags, setOrgTags] = useState<string[]>([]);
  const [orgHasUntaggedPosts, setOrgHasUntaggedPosts] = useState<boolean>(true);
  const [orgDefaultTagFilter, setOrgDefaultTagFilter] = useState<string | null>(null);
  const [orgPrimaryTags, setOrgPrimaryTags] = useState<string[]>([]);
  const [orgTagDisplayNames, setOrgTagDisplayNames] = useState<Record<string, string>>({});
  const [profilesLoaded, setProfilesLoaded] = useState<boolean>(false);
  const [selectedProfileIds, setSelectedProfileIdsState] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Viewer scope list — empty array means unrestricted (acts like admin
  // on this axis). One entry = locked to that single profile. Two or
  // more = picker shows only those profiles, plus an "All of mine"
  // aggregate when nothing is selected.
  const viewerScopes =
    session?.user?.role === "viewer" ? session.user.profileIds ?? [] : [];
  const isSingleLocked = viewerScopes.length === 1;
  const forcedProfileId = isSingleLocked ? viewerScopes[0] : null;

  const setSelectedProfileIds = useCallback((next: string[]) => {
    // Single-profile viewers can't change their selection.
    if (isSingleLocked) return;

    // Multi-profile viewers can only select within their scope. Filter
    // out anything outside their assigned profiles.
    const filtered = viewerScopes.length > 1
      ? next.filter((id) => viewerScopes.includes(id))
      : next;

    // Dedupe + stable sort so URL / localStorage values are deterministic.
    const cleaned = Array.from(new Set(filtered)).sort();

    setSelectedProfileIdsState(cleaned);

    // Persist to localStorage as JSON array. Empty = "all" → remove key.
    try {
      if (cleaned.length === 0) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    } catch {
      // private mode etc. — non-fatal
    }

    // URL param: comma-separated. The metric endpoints already parse
    // this via effectiveProfileIds().
    const params = new URLSearchParams(searchParams.toString());
    if (cleaned.length === 0) params.delete("profile");
    else params.set("profile", cleaned.join(","));
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, router, pathname, isSingleLocked, viewerScopes]);

  const fetchProfiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/profiles");
      const json = await res.json();
      if (res.ok && json.data) {
        setProfiles(json.data);
        setOrgPlatforms(Array.isArray(json.orgPlatforms) ? json.orgPlatforms : []);
        setOrgTags(Array.isArray(json.orgTags) ? json.orgTags : []);
        setOrgHasUntaggedPosts(typeof json.orgHasUntaggedPosts === "boolean" ? json.orgHasUntaggedPosts : true);
        setOrgDefaultTagFilter(typeof json.orgDefaultTagFilter === "string" ? json.orgDefaultTagFilter : null);
        setOrgPrimaryTags(Array.isArray(json.orgPrimaryTags) ? json.orgPrimaryTags : []);
        setOrgTagDisplayNames(
          json.orgTagDisplayNames && typeof json.orgTagDisplayNames === "object"
            ? (json.orgTagDisplayNames as Record<string, string>)
            : {}
        );
        setProfilesLoaded(true);
      }
    } catch {
      // silently fail — profiles are optional
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load profiles when authenticated
  useEffect(() => {
    if (status === "authenticated") {
      fetchProfiles();
    }
  }, [status, fetchProfiles]);

  // Initialize selection from URL > localStorage (gated by viewer scope).
  useEffect(() => {
    if (initialized) return;
    if (status === "loading") return;

    if (forcedProfileId) {
      // Single-profile viewer — force their only profile.
      setSelectedProfileIdsState([forcedProfileId]);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([forcedProfileId]));
      } catch { /* ignore */ }
    } else {
      const urlProfile = searchParams.get("profile");
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch { /* ignore */ }
      const candidate = urlProfile ?? stored;
      const ids = parseStoredSelection(candidate);

      if (viewerScopes.length > 1) {
        // Multi-profile viewer — only keep ids within their scope. Empty
        // result → "all of mine".
        const allowed = ids.filter((id) => viewerScopes.includes(id));
        setSelectedProfileIdsState(allowed);
      } else {
        // Admin / unscoped viewer — accept the parsed selection as-is.
        setSelectedProfileIdsState(ids);
      }
    }
    setInitialized(true);
  }, [searchParams, initialized, forcedProfileId, status, viewerScopes]);

  // If a stored profile id no longer exists in the loaded profile list,
  // drop it. Keeps the rest of the selection intact.
  useEffect(() => {
    if (!profilesLoaded || profiles.length === 0) return;
    if (selectedProfileIds.length === 0) return;
    const known = new Set(profiles.map((p) => p.id));
    const filtered = selectedProfileIds.filter((id) => known.has(id));
    if (filtered.length !== selectedProfileIds.length) {
      setSelectedProfileIds(filtered);
    }
  }, [profiles, profilesLoaded, selectedProfileIds, setSelectedProfileIds]);

  // Aggregation across the selected profiles. Empty selection → use the
  // org-wide values. One or more selected → union the platforms / tags
  // and OR the untagged flag. Default tag filter takes the
  // alphabetically-first non-null candidate.
  const aggregated = useMemo(() => {
    if (selectedProfileIds.length === 0) {
      return {
        platforms: orgPlatforms,
        tags: orgTags,
        hasUntagged: orgHasUntaggedPosts,
        defaultTag: orgDefaultTagFilter,
        primaryTags: orgPrimaryTags,
        tagDisplayNames: orgTagDisplayNames,
      };
    }
    const selected = profiles.filter((p) => selectedProfileIds.includes(p.id));
    const platforms = Array.from(new Set(selected.flatMap((p) => p.platforms ?? [])));
    const tags = Array.from(new Set(selected.flatMap((p) => p.tags ?? []))).sort();
    const hasUntagged = selected.some((p) => p.hasUntaggedPosts ?? true);
    const defaultTagCandidates = selected
      .map((p) => p.defaultTagFilter)
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    const defaultTag = defaultTagCandidates.length > 0
      ? [...defaultTagCandidates].sort()[0]
      : null;
    const primaryTags = Array.from(
      new Set(selected.flatMap((p) => p.primaryTags ?? []))
    ).sort();
    // Merge display-name maps across selected profiles. First write
    // wins on collisions — they shouldn't differ across accounts for
    // the same canonical tag, but if they do, just pick one.
    const tagDisplayNames: Record<string, string> = {};
    for (const p of selected) {
      const m = p.tagDisplayNames ?? {};
      for (const k of Object.keys(m)) {
        if (!tagDisplayNames[k]) tagDisplayNames[k] = m[k];
      }
    }
    return { platforms, tags, hasUntagged, defaultTag, primaryTags, tagDisplayNames };
  }, [
    selectedProfileIds,
    profiles,
    orgPlatforms,
    orgTags,
    orgHasUntaggedPosts,
    orgDefaultTagFilter,
    orgPrimaryTags,
    orgTagDisplayNames,
  ]);

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        selectedProfileIds,
        setSelectedProfileIds,
        isLoading,
        initialized,
        refetch: fetchProfiles,
        activePlatforms: aggregated.platforms,
        availableTags: aggregated.tags,
        hasUntaggedPostsInScope: aggregated.hasUntagged,
        defaultTagFilter: aggregated.defaultTag,
        primaryTags: aggregated.primaryTags,
        tagDisplayNames: aggregated.tagDisplayNames,
        profilesLoaded,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
