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

export default function PostsPage() {
  const { startDate, endDate, setDateRange } = useDateRange();
  const [tag, setTag] = useState<string | null>(null);
  const {
    availableTags,
    hasUntaggedPostsInScope,
    defaultTagFilter,
    profilesLoaded,
    selectedProfileId,
  } = useProfiles();
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
    const scopeKey = selectedProfileId ?? "__org__";
    if (appliedScopeRef.current === scopeKey) return;
    appliedScopeRef.current = scopeKey;
    setTag(defaultTagFilter);
  }, [profilesLoaded, selectedProfileId, defaultTagFilter]);

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
        <div
          className="page-pad"
          style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 16 }}
        >
          {/* Tag filter strip — same rules as dashboard / platform pages:
                - hidden when no tags exist in scope
                - hidden when one tag covers 100% of posts
                - single togglable pill when one tag with mixed coverage
                - full radio strip with 2+ tags
              Right-aligned so it doesn't push the table down. */}
          {availableTags.length > 0 &&
            !(availableTags.length === 1 && !hasUntaggedPostsInScope) && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(availableTags.length === 1
                  ? [{ label: availableTags[0], value: availableTags[0] }]
                  : [{ label: "All tags", value: null as string | null }, ...availableTags.map((t) => ({ label: t, value: t }))]
                ).map((opt) => {
                  const active = (tag ?? null) === opt.value;
                  const onClick = () => {
                    if (availableTags.length === 1) {
                      setTag(active ? null : opt.value);
                    } else {
                      setTag(opt.value);
                    }
                  };
                  return (
                    <button
                      key={opt.value ?? "__all_tags__"}
                      onClick={onClick}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: active ? "var(--accent)" : "var(--bg-elev)",
                        color: active ? "#fff" : "var(--fg-muted)",
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: opt.value ? "capitalize" : undefined,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <ContentPerformanceTable posts={data.posts} onToggleSponsored={() => refetch()} />
        </div>
      )}
    </>
  );
}
