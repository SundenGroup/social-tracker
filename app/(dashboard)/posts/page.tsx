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

export default function PostsPage() {
  const { startDate, endDate, setDateRange } = useDateRange();
  const [tag, setTag] = useState<string | null>(null);
  const {
    availableTags,
    hasUntaggedPostsInScope,
    defaultTagFilter,
    profilesLoaded,
    selectedProfileIds,
  } = useProfiles();
  const scopeKey = selectedProfileIds.length === 0 ? "__org__" : selectedProfileIds.join(",");
  const { data, isLoading, error, refetch } = useDashboard(
    startDate,
    endDate,
    undefined,
    tag
  );

  // Drop the tag if it disappears from scope (profile switch, rule edit).
  useEffect(() => {
    if (tag && !availableTags.includes(tag)) setTag(null);
  }, [tag, availableTags]);

  // Apply the always-on default tag once per scope. See dashboard / platform
  // pages for the same pattern + rationale.
  const appliedScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profilesLoaded) return;
    if (appliedScopeRef.current === scopeKey) return;
    appliedScopeRef.current = scopeKey;
    setTag(defaultTagFilter);
  }, [profilesLoaded, scopeKey, defaultTagFilter]);

  return (
    <>
      <Header title="Post performance" subtitle="Every post, every platform">
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s, e) => setDateRange(s, e)} />
        <ExportButton startDate={startDate} endDate={endDate} />
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
                hasUntaggedPostsInScope={hasUntaggedPostsInScope}
                tag={tag}
                setTag={setTag}
              />
            }
          />
        </div>
      )}
    </>
  );
}
