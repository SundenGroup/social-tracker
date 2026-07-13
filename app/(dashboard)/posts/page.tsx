"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import ExportButton from "@/components/common/ExportButton";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ContentPerformanceTable from "@/components/tables/ContentPerformanceTable";
import TopPostCard from "@/components/cards/TopPostCard";
import TagFilterPills from "@/components/common/TagFilterPills";
import ViewToggle from "@/components/common/ViewToggle";
import BestTimePanel from "@/components/analytics/BestTimePanel";
import { useDashboard } from "@/hooks/useDashboard";
import { useDateRange } from "@/hooks/useDateRange";
import { useProfiles } from "@/hooks/useProfiles";
import { PlatformGlyph, PLATFORM_COLOR } from "@/components/icons/PlatformGlyph";
import { UNTAGGED_FILTER, NO_EXTRAS_FILTER, SPONSORED_FILTER } from "@/lib/tagging";

type Metric = "views" | "engagements" | "rate";

const METRICS: { key: Metric; label: string }[] = [
  { key: "views", label: "By views" },
  { key: "engagements", label: "By engagements" },
  { key: "rate", label: "By eng. rate" },
];

const PLATFORM_FILTERS = [
  { key: "all", label: "All platforms" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "twitter", label: "X / Twitter" },
  { key: "instagram", label: "Instagram" },
];

/**
 * Posts — every individual post on every platform. Two views of the
 * same data:
 *   - Table: the sortable/searchable workhorse (was "Post performance")
 *   - Gallery: ranked cards by metric (was the separate "Top posts" page)
 * /top-posts redirects here with ?view=gallery.
 */
export default function PostsPage() {
  const { startDate, endDate, setDateRange } = useDateRange();
  const [view, setView] = useState<"table" | "gallery" | "timing">("table");
  const [tags, setTags] = useState<string[]>([]);
  const [metric, setMetric] = useState<Metric>("views");
  const [platform, setPlatform] = useState("all");
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
  const { data, isLoading, error, refetch } = useDashboard(startDate, endDate, undefined, tags);

  // Honor ?view=gallery / ?view=timing (redirect targets of the former
  // /top-posts and /best-time pages). Read from location instead of
  // useSearchParams to avoid a Suspense boundary on a client page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "gallery" || v === "timing") setView(v);
  }, []);

  useEffect(() => {
    if (tags.length === 0) return;
    const stillValid = tags.filter(
      (t) =>
        t === UNTAGGED_FILTER ||
        t === NO_EXTRAS_FILTER ||
        t === SPONSORED_FILTER ||
        availableTags.includes(t)
    );
    if (stillValid.length !== tags.length) setTags(stillValid);
  }, [tags, availableTags]);

  const appliedScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profilesLoaded) return;
    if (appliedScopeRef.current === scopeKey) return;
    appliedScopeRef.current = scopeKey;
    setTags(defaultTagFilter ? [defaultTagFilter] : []);
  }, [profilesLoaded, scopeKey, defaultTagFilter]);

  const ranked = useMemo(() => {
    if (!data) return [];
    return data.posts
      .filter((p) => platform === "all" || p.platform === platform)
      .sort((a, b) => {
        if (metric === "views") return b.views - a.views;
        if (metric === "engagements") {
          return b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares);
        }
        return b.engagementRate - a.engagementRate;
      })
      .slice(0, 25);
  }, [data, metric, platform]);

  return (
    <>
      <Header title="Posts" subtitle="Every post, every platform">
        <ViewToggle
          value={view}
          onChange={(v) => setView(v as "table" | "gallery" | "timing")}
          options={[
            { key: "table", label: "Table" },
            { key: "gallery", label: "Gallery" },
            { key: "timing", label: "Timing" },
          ]}
        />
        {/* The timing view runs on its own lookback window — the date
            picker and export don't apply there and would mislead. */}
        {view !== "timing" && (
          <>
            <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s, e) => setDateRange(s, e)} />
            <ExportButton startDate={startDate} endDate={endDate} tags={tags} />
          </>
        )}
      </Header>

      {view === "timing" && (
        <div className="page-pad" style={{ padding: "24px 28px 48px" }}>
          <BestTimePanel tags={tags} />
        </div>
      )}

      {view !== "timing" && isLoading && !data && (
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

      {data && view === "table" && (
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
                showSponsoredFilter
              />
            }
          />
        </div>
      )}

      {data && view === "gallery" && (
        <div
          className="page-pad"
          style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div
              style={{
                display: "flex",
                background: "var(--bg-sunken)",
                padding: 3,
                borderRadius: 9,
                border: "1px solid var(--border)",
              }}
            >
              {METRICS.map((o) => {
                const active = metric === o.key;
                return (
                  <button
                    key={o.key}
                    onClick={() => setMetric(o.key)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: "none",
                      background: active ? "var(--fg)" : "transparent",
                      color: active ? "var(--bg-elev)" : "var(--fg-muted)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PLATFORM_FILTERS.map((f) => {
                  const color = f.key === "all" ? null : PLATFORM_COLOR[f.key];
                  const active = platform === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setPlatform(f.key)}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: active ? "var(--fg)" : "var(--bg-elev)",
                        color: active ? "var(--bg-elev)" : "var(--fg-muted)",
                        fontSize: 12,
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {color && (
                        <span style={{ color: active ? "inherit" : color }}>
                          <PlatformGlyph platform={f.key} size={12} />
                        </span>
                      )}
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <TagFilterPills
                availableTags={availableTags}
                primaryTags={primaryTags}
                tagDisplayNames={tagDisplayNames}
                hasUntaggedPostsInScope={hasUntaggedPostsInScope}
                tags={tags}
                setTags={setTags}
              />
            </div>
          </div>

          {ranked.length === 0 ? (
            <div
              style={{
                padding: 48,
                textAlign: "center",
                color: "var(--fg-muted)",
                fontSize: 13,
                background: "var(--bg-elev)",
                border: "1px solid var(--border)",
                borderRadius: 14,
              }}
            >
              No posts match these filters.
            </div>
          ) : (
            <div className="row row-5">
              {ranked.map((p, i) => (
                <TopPostCard key={p.id} post={p} rank={i + 1} metric={metric} aspectRatio="4 / 5" />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
