"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import ExportButton from "@/components/common/ExportButton";
import { useDateRange } from "@/hooks/useDateRange";
import KPICard from "@/components/cards/KPICard";
import PlatformStrip, { type PlatformStripItem } from "@/components/cards/PlatformStrip";
import ContentPerformanceTable from "@/components/tables/ContentPerformanceTable";
import TopPostCard from "@/components/cards/TopPostCard";
import { Block } from "@/components/ui/Block";
import {
  LinesChart,
  SmallMultiplesChart,
  AnnotatedBarsChart,
  ChartVariantSwitcher,
  ChartLegend,
  type ChartVariant,
} from "@/components/charts/TrendChartVariants";
import CadenceHeatmap, { buildCadenceGrid } from "@/components/charts/CadenceHeatmap";
import ContentMixDonut from "@/components/charts/ContentMixDonut";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useDashboard } from "@/hooks/useDashboard";
import { useProfiles } from "@/hooks/useProfiles";
import { fmtK, fmtInt } from "@/lib/format";
import type { Platform } from "@/components/icons/PlatformGlyph";

const CONTENT_TYPE_TABS = [
  { label: "All", value: "all" },
  { label: "Video", value: "video" },
  { label: "Short-form", value: "short-form" },
  { label: "Long-form", value: "long-form" },
  { label: "Image", value: "image" },
];

export default function DashboardPage() {
  const { startDate, endDate, setDateRange } = useDateRange();
  const [contentType, setContentType] = useState("all");
  const [tag, setTag] = useState<string | null>(null);
  const [chartVariant, setChartVariant] = useState<ChartVariant>("bars");
  const { data, isLoading, error, refetch } = useDashboard(startDate, endDate, contentType, tag);
  // Charts respect the current profile's active platforms — so e.g.
  // VK doesn't show up as "0" in the legend/tooltip when the selected
  // profile has no VK accounts.
  const { activePlatforms, availableTags, hasUntaggedPostsInScope } = useProfiles();

  // Reset the tag selection if it disappears from the available list
  // (e.g. after switching profile to one that doesn't have that tag).
  useEffect(() => {
    if (tag && !availableTags.includes(tag)) {
      setTag(null);
    }
  }, [tag, availableTags]);

  // Build per-platform sparkline data from the trend series
  const platformStripItems: PlatformStripItem[] = useMemo(() => {
    if (!data) return [];
    return data.platforms.map((p) => ({
      platform: p.platform,
      views: p.views,
      engagements: p.engagements,
      followers: p.followers,
      followerGrowth: p.followerGrowth,
      engagementRate: p.views > 0 ? (p.engagements / p.views) * 100 : 0,
      topPost: p.topPost,
      sparkline: data.trends.map((t) => {
        const key = p.platform as keyof typeof t;
        return (typeof t[key] === "number" ? (t[key] as number) : 0);
      }),
    }));
  }, [data]);

  const cadenceGrid = useMemo(() => {
    if (!data) return [];
    return buildCadenceGrid(
      data.posts.map((p) => ({ publishedAt: p.publishedAt, views: p.views }))
    );
  }, [data]);

  const contentMix = useMemo(() => {
    if (!data) return [];
    const tally = new Map<string, number>();
    for (const p of data.posts) {
      tally.set(p.postType, (tally.get(p.postType) ?? 0) + p.views);
    }
    const palette: Record<string, string> = {
      video: "var(--accent)",
      "short-form": "var(--blue)",
      "long-form": "#7C86FF",
      image: "var(--fg-muted)",
      carousel: "#1DA1F2",
    };
    return Array.from(tally.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({
        label: label.charAt(0).toUpperCase() + label.slice(1),
        value,
        color: palette[label] ?? "var(--fg-muted)",
      }));
  }, [data]);

  const topPosts = useMemo(() => {
    if (!data) return [];
    return [...data.posts].sort((a, b) => b.views - a.views).slice(0, 5);
  }, [data]);

  // Range label for KPI subtitles. A range of Apr 16 → Apr 22 spans 7 days
  // inclusive; the raw subtraction gives 6 so we add 1 to count both endpoints.
  const daysDiff = Math.max(
    1,
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1
  );
  const rangeLabel = `from content posted in last ${daysDiff} days`;

  // Sync status summary
  const syncSummary = useMemo(() => {
    if (!data || data.accounts.length === 0) return null;
    const ok = data.accounts.filter((a) => a.syncStatus === "success").length;
    const total = data.accounts.length;
    const lastSynced = data.accounts
      .map((a) => (a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0))
      .reduce((a, b) => Math.max(a, b), 0);
    const minutesAgo = lastSynced ? Math.round((Date.now() - lastSynced) / 60000) : null;
    return { ok, total, minutesAgo };
  }, [data]);

  return (
    <>
      <Header title="Overview" subtitle="All platforms · selected period">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => setDateRange(s, e)}
        />
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
            <button
              onClick={() => refetch()}
              style={{
                marginLeft: 10,
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid currentColor",
                background: "transparent",
                color: "inherit",
                fontWeight: 600,
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {data && (
        <div
          className="page-pad"
          style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}
        >
          {/* Content type tabs + sync status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div className="hscroll" style={{ display: "flex", gap: 6, flexWrap: "nowrap", maxWidth: "100%" }}>
              {CONTENT_TYPE_TABS.map((ct) => {
                const active = contentType === ct.value;
                return (
                  <button
                    key={ct.value}
                    onClick={() => setContentType(ct.value)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: active ? "var(--fg)" : "var(--bg-elev)",
                      color: active ? "var(--bg-elev)" : "var(--fg-muted)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {ct.label}
                  </button>
                );
              })}
            </div>

            {syncSummary && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--fg-subtle)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: syncSummary.ok === syncSummary.total ? "var(--good)" : "var(--bad)",
                  }}
                />
                {syncSummary.minutesAgo != null
                  ? `Synced ${syncSummary.minutesAgo} min ago across ${syncSummary.total} accounts`
                  : `${syncSummary.ok}/${syncSummary.total} accounts synced`}
              </div>
            )}
          </div>

          {/* Tag filter strip — separate from the content-type strip so the
              two compose multiplicatively (e.g. "Esports" + "Short-form").
              Only rendered when the current scope actually has tags;
              admins on profiles with zero tagged content see nothing.
              Single-tag scopes get a single togglable pill ("Esports" on/off)
              instead of an "All tags / Esports" pair, which would just be a
              two-button on/off control. With 2+ tags the strip is needed so
              the user can switch between them and back to "all".
              Edge case: when there's exactly one tag AND every post in scope
              has it (100% coverage), the toggle does literally nothing —
              hide the strip entirely. */}
          {availableTags.length > 0 &&
            !(availableTags.length === 1 && !hasUntaggedPostsInScope) && (
            <div className="hscroll" style={{ display: "flex", gap: 6, flexWrap: "nowrap", maxWidth: "100%", marginTop: 8 }}>
              {(availableTags.length === 1
                ? [{ label: availableTags[0], value: availableTags[0] }]
                : [{ label: "All tags", value: null as string | null }, ...availableTags.map((t) => ({ label: t, value: t }))]
              ).map((opt) => {
                // Single-tag mode: clicking the pill toggles the filter on/off
                // (active when set, click again clears). Multi-tag mode keeps
                // the original radio-style behavior.
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
          )}

          {/* KPI cards */}
          <div className="row row-4">
            <KPICard
              label="Total views"
              value={fmtK(data.summary.totalViews)}
              delta={data.summary.comparison?.views}
              deltaSub={rangeLabel}
              sparkline={data.trends.map(
                (t) => (t.youtube ?? 0) + (t.twitter ?? 0) + (t.instagram ?? 0) + (t.tiktok ?? 0)
              )}
            />
            <KPICard
              label="Engagements"
              value={fmtK(data.summary.totalEngagements)}
              delta={data.summary.comparison?.engagements}
              deltaSub={`${data.summary.avgEngagementRate}% eng. rate`}
            />
            <KPICard
              label="Posts published"
              value={fmtInt(data.summary.totalPosts)}
              delta={data.summary.comparison?.posts}
              deltaSub={`across ${data.platforms.length} platforms`}
            />
            <KPICard
              label="Followers"
              value={fmtK(data.summary.totalFollowers)}
              delta={
                data.summary.totalFollowers > 0 && data.summary.totalFollowerGrowth !== 0
                  ? (data.summary.totalFollowerGrowth / data.summary.totalFollowers) * 100
                  : null
              }
              deltaSub={
                data.summary.totalFollowerGrowth !== 0
                  ? `${data.summary.totalFollowerGrowth > 0 ? "+" : ""}${fmtK(
                      data.summary.totalFollowerGrowth
                    )} this period`
                  : "no change this period"
              }
            />
          </div>

          {/* Platform strip */}
          {platformStripItems.length > 0 && <PlatformStrip items={platformStripItems} />}

          {/* Main trend chart with variant switcher */}
          <Block
            eyebrow="Performance"
            title="Views by publish date"
            rightSlot={<ChartVariantSwitcher value={chartVariant} onChange={setChartVariant} />}
          >
            {chartVariant === "lines" && <LinesChart data={data.trends} platforms={activePlatforms} />}
            {chartVariant === "multiples" && <SmallMultiplesChart data={data.trends} platforms={activePlatforms} />}
            {chartVariant === "bars" && <AnnotatedBarsChart data={data.trends} platforms={activePlatforms} />}
            <ChartLegend platforms={activePlatforms} />
          </Block>

          {/* Cadence heatmap */}
          {data.posts.length > 0 && (
            <Block
              eyebrow="Cadence"
              title="When posts land best"
              sub="Brighter cells = more posts. Hover for detail."
            >
              <CadenceHeatmap grid={cadenceGrid} />
            </Block>
          )}

          {/* Top posts strip + content mix */}
          {topPosts.length > 0 && (
            <div className="row row-2-1" style={{ gap: 20 }}>
              <Block
                eyebrow="Top posts"
                title="Most-watched this period"
                rightSlot={
                  <Link
                    href="/top-posts"
                    style={{
                      fontSize: 12,
                      color: "var(--fg-muted)",
                      textDecoration: "none",
                      fontWeight: 600,
                    }}
                  >
                    View all →
                  </Link>
                }
              >
                <div className="row row-5" style={{ gap: 10 }}>
                  {topPosts.map((p, i) => (
                    <TopPostCard key={p.id} post={p} rank={i + 1} compact />
                  ))}
                </div>
              </Block>
              <Block eyebrow="Content mix" title="What drove the views">
                <ContentMixDonut
                  segments={contentMix}
                  centerLabel={fmtK(data.posts.length)}
                  centerSub="posts"
                />
              </Block>
            </div>
          )}

          {/* Full performance table */}
          <Block
            eyebrow="All posts"
            title="Post performance"
            rightSlot={
              <Link
                href="/posts"
                style={{
                  fontSize: 12,
                  color: "var(--fg-muted)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                View full table →
              </Link>
            }
            flush
          >
            <div style={{ padding: "0 20px 20px" }}>
              <ContentPerformanceTable
                posts={data.posts}
                maxRows={10}
                hideToolbar
                onToggleSponsored={() => refetch()}
              />
            </div>
          </Block>
        </div>
      )}
    </>
  );
}
