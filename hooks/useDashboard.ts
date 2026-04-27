"use client";

import { useState, useEffect, useCallback } from "react";
import { useProfiles } from "@/hooks/useProfiles";
import type { PostPerformance } from "@/types";

interface PlatformSummary {
  platform: string;
  views: number;
  engagements: number;
  topPost: string | null;
  followers: number;
  followerGrowth: number;
}

interface AccountHealth {
  id: string;
  platform: string;
  accountName: string;
  syncStatus: string;
  lastSyncedAt: string | null;
}

interface Comparison {
  views: number;
  engagements: number;
  engagementRate: number;
  posts: number;
}

interface DashboardSummary {
  totalViews: number;
  totalEngagements: number;
  avgEngagementRate: number;
  totalImpressions: number;
  totalPosts: number;
  totalFollowers: number;
  totalFollowerGrowth: number;
  comparison: Comparison;
}

interface TrendPoint {
  date: string;
  youtube?: number;
  twitter?: number;
  instagram?: number;
  tiktok?: number;
}

interface DashboardData {
  summary: DashboardSummary;
  platforms: PlatformSummary[];
  posts: PostPerformance[];
  trends: TrendPoint[];
  accounts: AccountHealth[];
}

export function useDashboard(startDate: string, endDate: string, contentType?: string, tag?: string | null) {
  const { selectedProfileId, initialized } = useProfiles();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!initialized) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (contentType && contentType !== "all") {
        params.set("contentType", contentType);
      }
      if (selectedProfileId) {
        params.set("profileId", selectedProfileId);
      }
      if (tag) {
        params.set("tag", tag);
      }
      const res = await fetch(`/api/metrics/dashboard?${params}`, { signal });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load dashboard");
        return;
      }
      setData(json.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load dashboard");
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, contentType, tag, selectedProfileId, initialized]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
