"use client";

import { useState, useEffect, useCallback } from "react";
import { useProfiles } from "@/hooks/useProfiles";

interface PeriodPlatformRow {
  platform: string;
  views: number;
  engagements: number;
  engagementRate: number;
  posts: number;
}

interface PeriodSummary {
  label: string;
  summary: {
    totalViews: number;
    totalEngagements: number;
    avgEngagementRate: number;
    totalPosts: number;
  };
  platforms: PeriodPlatformRow[];
  dailyTrend: { day: number; views: number }[];
}

export interface PeriodComparisonData {
  periodA: PeriodSummary;
  periodB: PeriodSummary;
  changes: {
    views: number;
    engagements: number;
    engagementRate: number;
    posts: number;
    platforms: {
      platform: string;
      views: number;
      engagements: number;
      engagementRate: number;
      posts: number;
    }[];
  };
}

export function usePeriodComparison(
  startDateA: string,
  endDateA: string,
  startDateB: string,
  endDateB: string,
  contentType?: string
) {
  const { selectedProfileId } = useProfiles();
  const [data, setData] = useState<PeriodComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDateA, endDateA, startDateB, endDateB });
      if (contentType && contentType !== "all") {
        params.set("contentType", contentType);
      }
      if (selectedProfileId) {
        params.set("profileId", selectedProfileId);
      }
      const res = await fetch(`/api/metrics/period-comparison?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load period comparison data");
        return;
      }
      setData(json.data);
    } catch {
      setError("Failed to load period comparison data");
    } finally {
      setIsLoading(false);
    }
  }, [startDateA, endDateA, startDateB, endDateB, contentType, selectedProfileId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
