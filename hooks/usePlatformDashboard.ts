"use client";

import { useState, useEffect, useCallback } from "react";
import { useProfiles } from "@/hooks/useProfiles";

interface PostItem {
  id: string;
  postType: string;
  title: string | null;
  contentUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  isTrending: boolean;
  isSponsored: boolean;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
  watchDuration: number;
  engagements: number;
  engagementRate: number;
}

interface PlatformComparison {
  views: number;
  likes: number;
  comments: number;
  engagements: number;
  engagementRate: number;
  posts: number;
}

interface PlatformSummary {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalImpressions: number;
  totalReach: number;
  avgEngagementRate: number;
  totalPosts: number;
  comparison?: PlatformComparison;
}

interface PieSlice {
  name: string;
  value: number;
  color: string;
}

interface TopPost {
  name: string;
  value: number;
  id: string;
}

interface AccountInfo {
  id: string;
  accountName: string;
  syncStatus: string;
  lastSyncedAt: string | null;
}

interface AccountStats {
  totalFollowers: number;
  followerGrowth: number;
}

export interface PlatformDashboardData {
  summary: PlatformSummary;
  accountStats?: AccountStats;
  posts: PostItem[];
  trends: Record<string, unknown>[];
  engagementBreakdown: PieSlice[];
  topPosts: TopPost[];
  accounts: AccountInfo[];
}

export function usePlatformDashboard(
  platform: string,
  startDate: string,
  endDate: string,
  contentType?: string
) {
  const { selectedProfileId } = useProfiles();
  const [data, setData] = useState<PlatformDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
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
      const res = await fetch(`/api/metrics/platform/${platform}?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `Failed to load ${platform} dashboard`);
        return;
      }
      setData(json.data);
    } catch {
      setError(`Failed to load ${platform} dashboard`);
    } finally {
      setIsLoading(false);
    }
  }, [platform, startDate, endDate, contentType, selectedProfileId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
