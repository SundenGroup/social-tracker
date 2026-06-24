"use client";

import { useState, useEffect, useCallback } from "react";
import { useProfiles } from "@/hooks/useProfiles";
import { NO_EXTRAS_FILTER, SPONSORED_FILTER } from "@/lib/tagging";
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

export function useDashboard(
  startDate: string,
  endDate: string,
  contentType?: string,
  tags?: string[] | null
) {
  const { selectedProfileIds, initialized, availableTags, primaryTags } = useProfiles();
  // Stable string key — React state hands us a new array reference even
  // when contents are identical, so deps need the joined form.
  const profileIdsParam = selectedProfileIds.join(",");
  // Translate the NO_EXTRAS_FILTER sentinel into a concrete `notTag`
  // exclusion list (availableTags − primaryTags) so the server stays
  // sentinel-unaware. Real tags pass through as-is.
  const tagsList = tags ?? [];
  const wantsNoExtras = tagsList.includes(NO_EXTRAS_FILTER);
  // The "Sponsored" sentinel becomes `?sponsored=1` — the tag engine
  // never sees it.
  const wantsSponsored = tagsList.includes(SPONSORED_FILTER);
  const realTags = tagsList.filter(
    (t) => t !== NO_EXTRAS_FILTER && t !== SPONSORED_FILTER
  );
  const primarySet = new Set(primaryTags);
  const notTagsList = wantsNoExtras
    ? availableTags.filter((t) => !primarySet.has(t))
    : [];
  const tagsParam = realTags.join(",");
  const notTagParam = notTagsList.join(",");
  const sponsoredParam = wantsSponsored ? "1" : "";
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
      if (profileIdsParam) {
        params.set("profileId", profileIdsParam);
      }
      if (tagsParam) {
        params.set("tag", tagsParam);
      }
      if (notTagParam) {
        params.set("notTag", notTagParam);
      }
      if (sponsoredParam) {
        params.set("sponsored", sponsoredParam);
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
  }, [startDate, endDate, contentType, tagsParam, notTagParam, sponsoredParam, profileIdsParam, initialized]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
