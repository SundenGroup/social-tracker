"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import ExportButton from "@/components/common/ExportButton";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TopPostCard from "@/components/cards/TopPostCard";
import { useDashboard } from "@/hooks/useDashboard";
import { useDateRange } from "@/hooks/useDateRange";
import { useProfiles } from "@/hooks/useProfiles";
import { PlatformGlyph, PLATFORM_COLOR } from "@/components/icons/PlatformGlyph";
import TagFilterPills from "@/components/common/TagFilterPills";

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

export default function TopPostsPage() {
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
  const { data, isLoading, error } = useDashboard(startDate, endDate, undefined, tags);
  const [metric, setMetric] = useState<Metric>("views");
  const [platform, setPlatform] = useState("all");

  // Drop tags that disappear from scope.
  useEffect(() => {
    if (tags.length === 0) return;
    const stillValid = tags.filter((t) => availableTags.includes(t));
    if (stillValid.length !== tags.length) setTags(stillValid);
  }, [tags, availableTags]);

  // Apply the always-on default once per scope.
  const appliedScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profilesLoaded) return;
    if (appliedScopeRef.current === scopeKey) return;
    appliedScopeRef.current = scopeKey;
    setTags(defaultTagFilter ? [defaultTagFilter] : []);
  }, [profilesLoaded, scopeKey, defaultTagFilter]);

  const sorted = useMemo(() => {
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
      <Header title="Top posts" subtitle="Your best content this period">
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
          style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}
        >
          {/* Metric switcher + platform filter */}
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

            {/* Platform filters + tag pills share a flex row so the
                tag pill sits inline next to the platform filters
                (right edge of the row) instead of floating above the
                gallery on its own. */}
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

          {/* Gallery grid */}
          {sorted.length === 0 ? (
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
              {sorted.map((p, i) => (
                <TopPostCard key={p.id} post={p} rank={i + 1} metric={metric} aspectRatio="4 / 5" />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
