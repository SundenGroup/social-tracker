"use client";

import { useState, useEffect, useCallback } from "react";
import { useProfiles } from "@/hooks/useProfiles";
import { NO_EXTRAS_FILTER, SPONSORED_FILTER } from "@/lib/tagging";

export interface ContentGroupMember {
  id: string;
  platform: string;
  postType: string;
  contentUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface ContentGroup {
  groupId: string;
  title: string;
  profileId: string | null;
  profileName: string | null;
  publishedAt: string;
  platforms: string[];
  members: ContentGroupMember[];
  totalViews: number;
  totalEngagements: number;
  engagementRate: number;
}

export interface ContentGroupsData {
  groups: ContentGroup[];
  summary: {
    totalGroups: number;
    multiPlatformGroups: number;
    postsInRange: number;
  };
}

/**
 * Cross-platform content pieces for the current profile scope + date
 * range. Same sentinel translation as useDashboard so the shared
 * TagFilterPills works unchanged.
 */
export function useContentGroups(
  startDate: string,
  endDate: string,
  tags?: string[] | null,
  multiOnly?: boolean
) {
  const { selectedProfileIds, initialized, availableTags, primaryTags } = useProfiles();
  const profileIdsParam = selectedProfileIds.join(",");
  const tagsList = tags ?? [];
  const wantsNoExtras = tagsList.includes(NO_EXTRAS_FILTER);
  const realTags = tagsList.filter(
    (t) => t !== NO_EXTRAS_FILTER && t !== SPONSORED_FILTER
  );
  const primarySet = new Set(primaryTags);
  const notTagsList = wantsNoExtras
    ? availableTags.filter((t) => !primarySet.has(t))
    : [];
  const tagsParam = realTags.join(",");
  const notTagParam = notTagsList.join(",");

  const [data, setData] = useState<ContentGroupsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!initialized) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (profileIdsParam) params.set("profileId", profileIdsParam);
      if (tagsParam) params.set("tag", tagsParam);
      if (notTagParam) params.set("notTag", notTagParam);
      if (multiOnly) params.set("multiOnly", "1");
      const res = await fetch(`/api/metrics/content-groups?${params}`, { signal });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load content groups");
        return;
      }
      setData(json.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load content groups");
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, tagsParam, notTagParam, multiOnly, profileIdsParam, initialized]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return { data, isLoading, error, refetch: () => fetchData() };
}
