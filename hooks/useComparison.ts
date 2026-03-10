"use client";

import { useState, useEffect, useCallback } from "react";

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
  const [data, setData] = useState<ComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/metrics/comparison?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load comparison data");
        return;
      }
      setData(json.data);
    } catch {
      setError("Failed to load comparison data");
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
