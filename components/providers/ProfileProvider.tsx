"use client";

import { createContext, useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { ProfileResponse } from "@/types";

interface ProfileContextValue {
  profiles: ProfileResponse[];
  selectedProfileId: string | null;
  setSelectedProfileId: (id: string | null) => void;
  isLoading: boolean;
  initialized: boolean;
  refetch: () => Promise<void>;
  /**
   * Distinct platforms with at least one active connection in the current
   * scope (selected profile, or org-wide if "All profiles" is selected).
   * Used by the Sidebar to hide platform nav items that have no data.
   * Empty array = no data yet loaded / no connections; treated as "show all"
   * so we don't collapse the nav before we know the answer.
   */
  activePlatforms: string[];
}

export const ProfileContext = createContext<ProfileContextValue>({
  profiles: [],
  selectedProfileId: null,
  setSelectedProfileId: () => {},
  isLoading: false,
  initialized: false,
  refetch: async () => {},
  activePlatforms: [],
});

const STORAGE_KEY = "clutch-selected-profile";

export default function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [profiles, setProfiles] = useState<ProfileResponse[]>([]);
  const [orgPlatforms, setOrgPlatforms] = useState<string[]>([]);
  const [selectedProfileId, setSelectedProfileIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Scoped viewers are locked to a single profile and can't switch away.
  const forcedProfileId =
    session?.user?.role === "viewer" && session.user.profileId
      ? session.user.profileId
      : null;

  const setSelectedProfileId = useCallback((id: string | null) => {
    // Scoped viewers can't pick — silently ignore any attempt to change.
    if (forcedProfileId) return;

    setSelectedProfileIdState(id);

    // Persist to localStorage
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }

    // Update URL search params
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set("profile", id);
    } else {
      params.delete("profile");
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, router, pathname, forcedProfileId]);

  const fetchProfiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/profiles");
      const json = await res.json();
      if (res.ok && json.data) {
        setProfiles(json.data);
        setOrgPlatforms(Array.isArray(json.orgPlatforms) ? json.orgPlatforms : []);
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

  // Initialize selection.
  // Scoped viewers: force their assigned profile and ignore URL / storage.
  // Otherwise: URL param wins, then localStorage.
  useEffect(() => {
    if (initialized) return;
    if (status === "loading") return;

    if (forcedProfileId) {
      setSelectedProfileIdState(forcedProfileId);
      try {
        localStorage.setItem(STORAGE_KEY, forcedProfileId);
      } catch {
        // storage can be unavailable (private mode); non-fatal
      }
    } else {
      const urlProfile = searchParams.get("profile");
      if (urlProfile) {
        setSelectedProfileIdState(urlProfile);
        try {
          localStorage.setItem(STORAGE_KEY, urlProfile);
        } catch { /* ignore */ }
      } else {
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(STORAGE_KEY);
        } catch { /* ignore */ }
        if (stored) setSelectedProfileIdState(stored);
      }
    }
    setInitialized(true);
  }, [searchParams, initialized, forcedProfileId, status]);

  // If stored profile doesn't exist in the list, clear it
  useEffect(() => {
    if (
      selectedProfileId &&
      profiles.length > 0 &&
      !profiles.some((p) => p.id === selectedProfileId)
    ) {
      setSelectedProfileId(null);
    }
  }, [profiles, selectedProfileId, setSelectedProfileId]);

  // Active platforms derivation:
  //   - If a specific profile is selected, use that profile's `platforms`.
  //   - Otherwise fall back to the org-wide union from the API.
  //   - If neither is loaded yet (initial render before the profile fetch
  //     returns), stay empty — the Sidebar reads this as "show nothing yet"
  //     only briefly; the real answer arrives on the first successful fetch.
  const selectedProfile = selectedProfileId
    ? profiles.find((p) => p.id === selectedProfileId)
    : null;
  const activePlatforms = selectedProfile
    ? (selectedProfile.platforms ?? [])
    : orgPlatforms;

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        selectedProfileId,
        setSelectedProfileId,
        isLoading,
        initialized,
        refetch: fetchProfiles,
        activePlatforms,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
