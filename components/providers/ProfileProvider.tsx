"use client";

import { createContext, useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
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
  const [profiles, setProfiles] = useState<ProfileResponse[]>([]);
  const [selectedProfileId, setSelectedProfileIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const setSelectedProfileId = useCallback((id: string | null) => {
    setSelectedProfileIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

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

  // Restore selection from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSelectedProfileIdState(stored);
    }
  }, []);

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
