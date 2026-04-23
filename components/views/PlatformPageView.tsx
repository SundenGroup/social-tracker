"use client";

import { useState, useMemo } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import ExportButton from "@/components/common/ExportButton";
import { useDateRange } from "@/hooks/useDateRange";
import { usePlatformDashboard } from "@/hooks/usePlatformDashboard";
import { Block } from "@/components/ui/Block";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ContentPerformanceTable from "@/components/tables/ContentPerformanceTable";
import TopPostCard from "@/components/cards/TopPostCard";
import CadenceHeatmap, { buildCadenceGrid } from "@/components/charts/CadenceHeatmap";
import { SinglePlatformChart } from "@/components/charts/TrendChartVariants";
import { DeltaPill } from "@/components/ui/DeltaPill";
import {
  PlatformGlyph,
  PLATFORM_COLOR,
  PLATFORM_LABEL,
  type Platform,
} from "@/components/icons/PlatformGlyph";
import { fmtK, fmtInt } from "@/lib/format";
import type { PostPerformance } from "@/types";

interface PlatformPageViewProps {
  platform: Platform;
  /** Override the page title (defaults to the platform label). */
  title?: string;
  handle?: string;
}

const SECTION_TOGGLES = [
  { key: "types", label: "Content types" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "cadence", label: "Best time" },
  { key: "table", label: "Post performance" },
] as const;

type SectionKey = (typeof SECTION_TOGGLES)[number]["key"];

/**
 * Per-platform content-type filter options. These match the platform-native
 * content labels (Reels vs. Posts on Instagram, Shorts vs. Videos vs. Live
 * on YouTube, etc.) and map to the Prisma PostType enum server-side.
 *
 * TikTok is deliberately filter-less — every TikTok post is video.
 */
const PLATFORM_CONTENT_TABS: Record<Platform, { label: string; value: string }[]> = {
  instagram: [
    { label: "All", value: "all" },
    { label: "Reels", value: "video" },
    { label: "Posts", value: "image" },
    { label: "Carousels", value: "carousel" },
  ],
  youtube: [
    { label: "All", value: "all" },
    { label: "Shorts", value: "short" },
    { label: "Videos", value: "video" },
    { label: "Live", value: "live" },
  ],
  twitter: [
    { label: "All", value: "all" },
    { label: "Video only", value: "video" },
  ],
  tiktok: [],
};

export default function PlatformPageView({ platform, title, handle }: PlatformPageViewProps) {
  const { startDate, endDate, setDateRange } = useDateRange();
  const [contentType, setContentType] = useState("all");
  const { data, isLoading, error, refetch } = usePlatformDashboard(
    platform,
    startDate,
    endDate,
    contentType
  );

  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    types: true,
    leaderboard: true,
    cadence: true,
    table: true,
  });

  const toggle = (k: SectionKey) => setSections((s) => ({ ...s, [k]: !s[k] }));

  const color = PLATFORM_COLOR[platform] ?? "var(--accent)";
  const label = title ?? PLATFORM_LABEL[platform] ?? platform;

  // Content-type breakdown from posts
  const typeBreakdown = useMemo(() => {
    if (!data) return [];
    const tally = new Map<string, { count: number; views: number; eng: number }>();
    for (const p of data.posts) {
      const k = p.postType || "other";
      const t = tally.get(k) ?? { count: 0, views: 0, eng: 0 };
      t.count += 1;
      t.views += p.views;
      t.eng += p.likes + p.comments + p.shares;
      tally.set(k, t);
    }
    return Array.from(tally.entries())
      .map(([key, v]) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        count: v.count,
        views: v.views,
        eng: v.eng,
        rate: v.views > 0 ? +((v.eng / v.views) * 100).toFixed(2) : 0,
      }))
      .sort((a, b) => b.views - a.views);
  }, [data]);

  const maxTypeViews = Math.max(...typeBreakdown.map((t) => t.views), 1);

  const leaderboard = useMemo(() => {
    if (!data) return [];
    return [...data.posts].sort((a, b) => b.views - a.views).slice(0, 8);
  }, [data]);

  const cadenceGrid = useMemo(() => {
    if (!data) return [];
    return buildCadenceGrid(data.posts.map((p) => ({ publishedAt: p.publishedAt, views: p.views })));
  }, [data]);

  // Adapt platform trends (Record<string, unknown>[]) to the SinglePlatformChart shape
  const trendData = useMemo(() => {
    if (!data) return [];
    return data.trends.map((t) => ({
      date: String(t.date ?? ""),
      [platform]: typeof t.views === "number" ? t.views : 0,
    }));
  }, [data, platform]);

  // Convert PlatformDashboard posts to PostPerformance shape (add platform)
  const tablePosts: PostPerformance[] = useMemo(() => {
    if (!data) return [];
    return data.posts.map((p) => ({
      ...p,
      platform,
      isTrending: p.isTrending ?? false,
    })) as PostPerformance[];
  }, [data, platform]);

  // Sync status
  const syncSummary = useMemo(() => {
    if (!data || data.accounts.length === 0) return null;
    const lastSynced = data.accounts
      .map((a) => (a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0))
      .reduce((a, b) => Math.max(a, b), 0);
    const minutesAgo = lastSynced ? Math.round((Date.now() - lastSynced) / 60000) : null;
    return { minutesAgo };
  }, [data]);

  return (
    <>
      <Header title={label} subtitle="Single-platform breakdown">
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s, e) => setDateRange(s, e)} />
        <ExportButton startDate={startDate} endDate={endDate} platform={platform} />
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
          {/* Platform-specific content type filter — applies to every section below.
              Hidden entirely on platforms that don't have meaningful sub-types
              (TikTok is video-only, so the filter would only ever say "All"). */}
          {PLATFORM_CONTENT_TABS[platform].length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PLATFORM_CONTENT_TABS[platform].map((ct) => {
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
          )}

          {/* Hero — two tier */}
          <div
            style={{
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: color,
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <PlatformGlyph platform={platform} size={28} invert />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--fg-subtle)",
                  }}
                >
                  Platform
                </div>
                <h1
                  className="display"
                  style={{
                    margin: "2px 0 3px",
                    fontSize: 24,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    color: "var(--fg)",
                  }}
                >
                  {label}
                </h1>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    color: "var(--fg-muted)",
                    fontSize: 12,
                    flexWrap: "wrap",
                  }}
                >
                  {handle && <span className="mono">{handle}</span>}
                  {handle && <span style={{ opacity: 0.4 }}>·</span>}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: syncSummary?.minutesAgo != null ? "var(--good)" : "var(--fg-subtle)",
                      }}
                    />
                    {syncSummary?.minutesAgo != null
                      ? `Synced ${syncSummary.minutesAgo} min ago`
                      : "No sync yet"}
                  </span>
                </div>
              </div>
            </div>
            {/* Tier 2 — 5 KPI cells. The platform-kpi-row class ensures this
                 collapses to 2 columns on tablet and keeps 2 columns on phone
                 (instead of stacking into 5 rows, which would look silly). */}
            <div
              className="platform-kpi-row"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                borderTop: "1px solid var(--border)",
              }}
            >
              <KPICell label="Posts" value={fmtInt(data.summary.totalPosts)} sub="this period" />
              <KPICell
                label="Views"
                value={fmtK(data.summary.totalViews)}
                delta={data.summary.comparison?.views}
                accent={color}
              />
              <KPICell
                label="Engagements"
                value={fmtK(
                  data.summary.totalLikes + data.summary.totalComments + data.summary.totalShares
                )}
                delta={data.summary.comparison?.engagements}
              />
              <KPICell
                label="Eng. rate"
                value={`${data.summary.avgEngagementRate}%`}
                delta={data.summary.comparison?.engagementRate}
              />
              <KPICell
                label="Followers"
                value={data.accountStats ? fmtK(data.accountStats.totalFollowers) : "—"}
                subAbsolute={data.accountStats?.followerGrowth}
                last
              />
            </div>
          </div>

          {/* Main trend chart */}
          <Block eyebrow="Trend" title="Daily views">
            <SinglePlatformChart data={trendData} platform={platform} />
          </Block>

          {/* Section toggles — live under the chart so they scope the rest of the page */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--fg-subtle)",
                marginRight: 4,
              }}
            >
              Show
            </span>
            {SECTION_TOGGLES.map((t) => {
              const on = sections[t.key];
              return (
                <button
                  key={t.key}
                  onClick={() => toggle(t.key)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 7,
                    border: `1px solid ${on ? "var(--fg)" : "var(--border)"}`,
                    background: on ? "var(--fg)" : "var(--bg-elev)",
                    color: on ? "var(--bg-elev)" : "var(--fg-muted)",
                    fontSize: 11,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      border: `1.5px solid ${on ? "var(--bg-elev)" : "var(--border-strong)"}`,
                      background: on ? "var(--bg-elev)" : "transparent",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {on && <span style={{ width: 4, height: 4, background: "var(--fg)", borderRadius: 1 }} />}
                  </span>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Content types + Leaderboard row — side by side on desktop,
               stacks to a single column at ≤900px via .row-1-11. */}
          {(sections.types || sections.leaderboard) && (
            <div
              className={sections.types && sections.leaderboard ? "row row-1-11" : "row"}
              style={{
                ...(sections.types && sections.leaderboard
                  ? {}
                  : { gridTemplateColumns: "minmax(0, 1fr)" }),
                gap: 20,
              }}
            >
              {sections.types && (
                <Block eyebrow="Content types" title="What works on this platform">
                  {typeBreakdown.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--fg-muted)", padding: 20, textAlign: "center" }}>
                      No posts in this period
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "120px 1fr 60px 80px 60px",
                          gap: 10,
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "var(--fg-subtle)",
                          paddingBottom: 8,
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <div>Type</div>
                        <div>Views share</div>
                        <div style={{ textAlign: "right" }}>Posts</div>
                        <div style={{ textAlign: "right" }}>Views</div>
                        <div style={{ textAlign: "right" }}>Rate</div>
                      </div>
                      {typeBreakdown.map((t) => (
                        <div
                          key={t.key}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "120px 1fr 60px 80px 60px",
                            gap: 10,
                            alignItems: "center",
                            fontSize: 12,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              fontWeight: 600,
                              color: "var(--fg)",
                            }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                            {t.label}
                          </div>
                          <div
                            style={{
                              height: 10,
                              background: "var(--bg-sunken)",
                              borderRadius: 3,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${(t.views / maxTypeViews) * 100}%`,
                                background: color,
                              }}
                            />
                          </div>
                          <div
                            className="mono tnum"
                            style={{ textAlign: "right", color: "var(--fg-muted)" }}
                          >
                            {t.count}
                          </div>
                          <div
                            className="mono tnum"
                            style={{ textAlign: "right", fontWeight: 700, color: "var(--fg)" }}
                          >
                            {fmtK(t.views)}
                          </div>
                          <div
                            className="mono tnum"
                            style={{
                              textAlign: "right",
                              color: t.rate > 2 ? "var(--good)" : "var(--fg-muted)",
                              fontWeight: t.rate > 2 ? 600 : 400,
                            }}
                          >
                            {t.rate}%
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Block>
              )}

              {sections.leaderboard && leaderboard.length > 0 && (
                <Block eyebrow="Leaderboard" title="Top posts on this platform">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                    {leaderboard.map((p, i) => (
                      <LeaderboardRow
                        key={p.id}
                        post={{ ...p, platform } as PostPerformance}
                        rank={i + 1}
                        max={leaderboard[0].views}
                        color={color}
                      />
                    ))}
                  </div>
                </Block>
              )}
            </div>
          )}

          {/* Cadence */}
          {sections.cadence && data.posts.length > 0 && (
            <Block
              eyebrow="Best time"
              title="When posts land best"
              sub="Brighter cells = more posts. Hover for detail."
            >
              <CadenceHeatmap grid={cadenceGrid} />
            </Block>
          )}

          {/* Post performance table */}
          {sections.table && (
            <Block eyebrow="Post performance" title={`All ${label} posts this period`} flush>
              <div style={{ padding: "0 20px 20px" }}>
                <ContentPerformanceTable
                  posts={tablePosts}
                  lockedPlatform={platform}
                  hideToolbar
                  onToggleSponsored={() => refetch()}
                />
              </div>
            </Block>
          )}

          {/* Fallback: if nothing toggled on, show top posts */}
          {leaderboard.length > 0 &&
            !sections.types &&
            !sections.leaderboard &&
            !sections.cadence &&
            !sections.table && (
              <Block eyebrow="Top posts" title="Highlights" flush>
                <div style={{ padding: "0 20px 20px" }}>
                  <div className="row row-5" style={{ gap: 10 }}>
                    {leaderboard.slice(0, 5).map((p, i) => (
                      <TopPostCard
                        key={p.id}
                        post={{ ...p, platform } as PostPerformance}
                        rank={i + 1}
                        compact
                      />
                    ))}
                  </div>
                </div>
              </Block>
            )}
        </div>
      )}
    </>
  );
}

function KPICell({
  label,
  value,
  delta,
  sub,
  subAbsolute,
  accent,
  last,
}: {
  label: string;
  value: string;
  delta?: number | null;
  sub?: string;
  subAbsolute?: number;
  accent?: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "16px 22px",
        borderRight: last ? "none" : "1px solid var(--border)",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          fontWeight: 600,
          color: "var(--fg-muted)",
          letterSpacing: "0.06em",
          marginBottom: 8,
          textTransform: "uppercase",
        }}
      >
        {accent && <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />}
        {label}
      </div>
      <div
        className="tnum"
        style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: "var(--fg)" }}
      >
        {value}
      </div>
      {delta != null && !Number.isNaN(delta) ? (
        <DeltaPill delta={delta} sub="vs prev" />
      ) : subAbsolute != null && subAbsolute !== 0 ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            fontWeight: 600,
            color: subAbsolute > 0 ? "var(--good)" : "var(--bad)",
          }}
        >
          {subAbsolute > 0 ? "+" : ""}
          {fmtK(subAbsolute)} this period
        </div>
      ) : sub ? (
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--fg-subtle)" }}>{sub}</div>
      ) : null}
    </div>
  );
}

function LeaderboardRow({
  post,
  rank,
  max,
  color,
}: {
  post: PostPerformance;
  rank: number;
  max: number;
  color: string;
}) {
  return (
    <a
      href={post.contentUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "32px 48px 1fr auto",
          gap: 10,
          padding: "8px 10px",
          alignItems: "center",
          borderRadius: 8,
        }}
      >
        <div className="mono" style={{ fontSize: 12, color: "var(--fg-subtle)", fontWeight: 700 }}>
          {rank < 10 ? `0${rank}` : String(rank)}
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 6,
            overflow: "hidden",
            background: "var(--bg-sunken)",
          }}
        >
          {post.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.thumbnailUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--fg)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {post.title || "Untitled"}
          </div>
          <div
            style={{
              marginTop: 5,
              height: 4,
              background: "var(--bg-sunken)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(post.views / max) * 100}%`,
                background: color,
              }}
            />
          </div>
        </div>
        <div
          className="tnum"
          style={{ fontWeight: 700, fontSize: 13, color: "var(--fg)" }}
        >
          {fmtK(post.views)}
        </div>
      </div>
    </a>
  );
}
