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
  refetch: () => Promise<void>;
}

export const ProfileContext = createContext<ProfileContextValue>({
  profiles: [],
  selectedProfileId: null,
  setSelectedProfileId: () => {},
  isLoading: false,
  refetch: async () => {},
});

const STORAGE_KEY = "clutch-selected-profile";

export default function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [profiles, setProfiles] = useState<ProfileResponse[]>([]);
  const [selectedProfileId, setSelectedProfileIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const setSelectedProfileId = useCallback((id: string | null) => {
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
  }, [searchParams, router, pathname]);

  const fetchProfiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/profiles");
      const json = await res.json();
      if (res.ok && json.data) {
        setProfiles(json.data);
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

  // Initialize selection: URL param takes priority, then localStorage
  useEffect(() => {
    if (initialized) return;
    const urlProfile = searchParams.get("profile");
    if (urlProfile) {
      setSelectedProfileIdState(urlProfile);
      localStorage.setItem(STORAGE_KEY, urlProfile);
    } else {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSelectedProfileIdState(stored);
      }
    }
    setInitialized(true);
  }, [searchParams, initialized]);

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

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        selectedProfileId,
        setSelectedProfileId,
        isLoading,
        refetch: fetchProfiles,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
