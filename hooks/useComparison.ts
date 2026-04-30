"use client";

import { useState, useEffect, useCallback } from "react";
import { useProfiles } from "@/hooks/useProfiles";

interface PlatformRow {
  platform: string;
  views: number;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  engagements: number;
  engagementRate: number;
  followers: number;
  followerGrowth: number;
  totalPosts: number;
  accountName: string | null;
}

interface PieSlice {
  name: string;
  value: number;
  color: string;
}

interface BarItem {
  name: string;
  value: number;
}

export interface ComparisonData {
  platforms: PlatformRow[];
  trends: Record<string, unknown>[];
  engagementDistribution: PieSlice[];
  contentVolume: BarItem[];
}

export function useComparison(startDate: string, endDate: string) {
  const { selectedProfileIds, initialized } = useProfiles();
  const profileIdsParam = selectedProfileIds.join(",");
  const [data, setData] = useState<ComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!initialized) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (profileIdsParam) {
        params.set("profileId", profileIdsParam);
      }
      const res = await fetch(`/api/metrics/comparison?${params}`, { signal });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load comparison data");
        return;
      }
      setData(json.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load comparison data");
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, profileIdsParam, initialized]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
