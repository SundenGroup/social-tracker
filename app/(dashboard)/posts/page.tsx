"use client";

import { useState, useEffect, useRef } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import ExportButton from "@/components/common/ExportButton";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ContentPerformanceTable from "@/components/tables/ContentPerformanceTable";
import { useDashboard } from "@/hooks/useDashboard";
import { useDateRange } from "@/hooks/useDateRange";
import { useProfiles } from "@/hooks/useProfiles";
import TagFilterPills from "@/components/common/TagFilterPills";
import { UNTAGGED_FILTER, NO_EXTRAS_FILTER } from "@/lib/tagging";

export default function PostsPage() {
  const { startDate, endDate, setDateRange } = useDateRange();
  const [tags, setTags] = useState<string[]>([]);
  const {
    availableTags,
    hasUntaggedPostsInScope,
    defaultTagFilter,
    primaryTags,
    tagDisplayNames,
    profilesLoaded,
    selectedProfileIds,
  } = useProfiles();
  const scopeKey = selectedProfileIds.length === 0 ? "__org__" : selectedProfileIds.join(",");
  const { data, isLoading, error, refetch } = useDashboard(
    startDate,
    endDate,
    undefined,
    tags
  );

  // Drop any selected tags that disappear from scope (profile switch,
  // rule edit). UNTAGGED_FILTER is always valid.
  useEffect(() => {
    if (tags.length === 0) return;
    const stillValid = tags.filter(
      (t) => t === UNTAGGED_FILTER || t === NO_EXTRAS_FILTER || availableTags.includes(t)
    );
    if (stillValid.length !== tags.length) setTags(stillValid);
  }, [tags, availableTags]);

  // Apply the always-on default tag once per scope.
  const appliedScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profilesLoaded) return;
    if (appliedScopeRef.current === scopeKey) return;
    appliedScopeRef.current = scopeKey;
    setTags(defaultTagFilter ? [defaultTagFilter] : []);
  }, [profilesLoaded, scopeKey, defaultTagFilter]);

  return (
    <>
      <Header title="Post performance" subtitle="Every post, every platform">
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s, e) => setDateRange(s, e)} />
        <ExportButton startDate={startDate} endDate={endDate} tags={tags} />
      </Header>

      {isLoading && !data && (
        <div style={{ display: "flex", minHeight: 400, alignItems: "center", justifyContent: "center" }}>
          <LoadingSpinner size="lg" />
        </div>
      )}

      {error && (
        <div style={{ padding: "24px 28px" }}>
          <div
            style={{
              background: "color-mix(in srgb, var(--bad) 8%, transparent)",
              color: "var(--bad)",
              border: "1px solid color-mix(in srgb, var(--bad) 40%, transparent)",
              borderRadius: 10,
              padding: 14,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        </div>
      )}

      {data && (
        <div className="page-pad" style={{ padding: "24px 28px 48px" }}>
          <ContentPerformanceTable
            posts={data.posts}
            onToggleSponsored={() => refetch()}
            tagFilter={
              <TagFilterPills
                availableTags={availableTags}
                primaryTags={primaryTags}
                tagDisplayNames={tagDisplayNames}
                hasUntaggedPostsInScope={hasUntaggedPostsInScope}
                tags={tags}
                setTags={setTags}
              />
            }
          />
        </div>
      )}
    </>
  );
}
