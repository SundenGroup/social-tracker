"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Header from "@/components/layouts/Header";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ExportButton from "@/components/common/ExportButton";
import { Block } from "@/components/ui/Block";
import { DeltaPill } from "@/components/ui/DeltaPill";
import { usePeriodComparison, type PeriodSummary, type PeriodTopPost } from "@/hooks/usePeriodComparison";
import { useProfiles } from "@/hooks/useProfiles";
import TagFilterPills from "@/components/common/TagFilterPills";
import { UNTAGGED_FILTER, NO_EXTRAS_FILTER } from "@/lib/tagging";
import { fmtK, fmtInt } from "@/lib/format";
import { PlatformGlyph, PLATFORM_COLOR, PLATFORM_LABEL } from "@/components/icons/PlatformGlyph";
import { thumbSrc, thumbProxySrc } from "@/lib/thumb-src";

const TYPE_LABELS: Record<string, string> = {
  video: "Video",
  short: "Shorts",
  image: "Image",
  carousel: "Carousel",
  slideshow: "Slideshow",
  text: "Text",
  live: "Live",
  story: "Story",
};

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function fmtRange(start: string, end: string) {
  try {
    const a = new Date(start);
    const b = new Date(end);
    const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const sameYear = a.getFullYear() === b.getFullYear();
    return sameYear
      ? `${m(a)} – ${m(b)}, ${b.getFullYear()}`
      : `${m(a)}, ${a.getFullYear()} – ${m(b)}, ${b.getFullYear()}`;
  } catch {
    return `${start} – ${end}`;
  }
}

const CONTENT_TYPES = [
  { label: "All", value: "all" },
  { label: "Video", value: "video" },
  { label: "Short-form", value: "short-form" },
  { label: "Long-form", value: "long-form" },
  { label: "Image", value: "image" },
];

export default function PeriodComparisonPage() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const lastYearEnd = new Date(now.getTime() - 365 * 86400000);
  const lastYearStart = new Date(thirtyDaysAgo.getTime() - 365 * 86400000);

  const [startA, setStartA] = useState(toDateStr(thirtyDaysAgo));
  const [endA, setEndA] = useState(toDateStr(now));
  const [startB, setStartB] = useState(toDateStr(lastYearStart));
  const [endB, setEndB] = useState(toDateStr(lastYearEnd));
  const [contentType, setContentType] = useState("all");
  const [tags, setTags] = useState<string[]>([]);
  const [overlayMetric, setOverlayMetric] = useState<"views" | "engagements">("views");
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

  const { data, isLoading, error, refetch } = usePeriodComparison(startA, endA, startB, endB, contentType, tags);

  // Drop tags that disappear from scope. UNTAGGED_FILTER stays.
  useEffect(() => {
    if (tags.length === 0) return;
    const stillValid = tags.filter(
      (t) => t === UNTAGGED_FILTER || t === NO_EXTRAS_FILTER || availableTags.includes(t)
    );
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

  function applyPreviousPeriod() {
    const sA = new Date(startA);
    const eA = new Date(endA);
    const spanMs = eA.getTime() - sA.getTime();
    const newEndB = new Date(sA.getTime() - 86400000);
    const newStartB = new Date(newEndB.getTime() - spanMs);
    setStartB(toDateStr(newStartB));
    setEndB(toDateStr(newEndB));
  }

  function applySamePeriodLastYear() {
    const sA = new Date(startA);
    const eA = new Date(endA);
    sA.setFullYear(sA.getFullYear() - 1);
    eA.setFullYear(eA.getFullYear() - 1);
    setStartB(toDateStr(sA));
    setEndB(toDateStr(eA));
  }

  return (
    <>
      <Header title="Compare periods" subtitle="This period vs. another">
        <ExportButton startDate={startA} endDate={endA} tags={tags} label="Export period A" />
      </Header>

      <div
        className="page-pad"
        style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}
      >
        {/* Period picker row */}
        <div
          style={{
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 14,
            display: "flex",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <PeriodChip
            label="Period A"
            color="var(--accent)"
            start={startA}
            end={endA}
            onStartChange={setStartA}
            onEndChange={setEndA}
          />
          <div style={{ color: "var(--fg-subtle)", fontSize: 12, fontWeight: 600 }}>vs</div>
          <PeriodChip
            label="Period B"
            color="var(--fg-subtle)"
            dashed
            start={startB}
            end={endB}
            onStartChange={setStartB}
            onEndChange={setEndB}
          />
          <div style={{ flex: 1 }} />
          <button
            onClick={applyPreviousPeriod}
            style={{
              padding: "7px 12px",
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-sunken)",
              color: "var(--fg-muted)",
              fontWeight: 600,
            }}
          >
            Previous period
          </button>
          <button
            onClick={applySamePeriodLastYear}
            style={{
              padding: "7px 12px",
              fontSize: 12,
              borderRadius: 8,
              border: "none",
              background: "var(--fg)",
              color: "var(--bg-elev)",
              fontWeight: 600,
            }}
          >
            Same period last year
          </button>
        </div>

        {/* Content type filter (left) + tag filter (right). Same row so
            the layout doesn't push the cards down. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CONTENT_TYPES.map((ct) => {
              const active = contentType === ct.value;
              return (
                <button
                  key={ct.value}
                  onClick={() => setContentType(ct.value)}
                  style={{
                    padding: "6px 12px",
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

          <TagFilterPills
            availableTags={availableTags}
            primaryTags={primaryTags}
            tagDisplayNames={tagDisplayNames}
            hasUntaggedPostsInScope={hasUntaggedPostsInScope}
            tags={tags}
            setTags={setTags}
          />
        </div>

        {isLoading && !data && (
          <div style={{ display: "flex", minHeight: 300, alignItems: "center", justifyContent: "center" }}>
            <LoadingSpinner size="lg" />
          </div>
        )}

        {error && (
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
        )}

        {data && (
          <>
            {/* Delta-first KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
              <DeltaCard
                label="Total views"
                currentValue={fmtK(data.periodA.summary.totalViews)}
                previousValue={fmtK(data.periodB.summary.totalViews)}
                delta={data.changes.views}
              />
              <DeltaCard
                label="Engagements"
                currentValue={fmtK(data.periodA.summary.totalEngagements)}
                previousValue={fmtK(data.periodB.summary.totalEngagements)}
                delta={data.changes.engagements}
              />
              <DeltaCard
                label="Avg. eng. rate"
                currentValue={`${data.periodA.summary.avgEngagementRate}%`}
                previousValue={`${data.periodB.summary.avgEngagementRate}%`}
                delta={data.changes.engagementRate}
              />
              <DeltaCard
                label="Posts published"
                currentValue={fmtInt(data.periodA.summary.totalPosts)}
                previousValue={fmtInt(data.periodB.summary.totalPosts)}
                delta={data.changes.posts}
              />
              <DeltaCard
                label="Avg. views / post"
                currentValue={fmtK(data.periodA.summary.viewsPerPost)}
                previousValue={fmtK(data.periodB.summary.viewsPerPost)}
                delta={data.changes.viewsPerPost}
              />
              <FollowersCard periodA={data.periodA} periodB={data.periodB} delta={data.changes.followers} />
            </div>

            {/* Per-platform comparison */}
            <Block eyebrow="By platform" title="Where the lift came from">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.periodA.platforms.map((p) => {
                  const change = data.changes.platforms.find((c) => c.platform === p.platform);
                  const b = data.periodB.platforms.find((x) => x.platform === p.platform);
                  const max = Math.max(
                    ...data.periodA.platforms.map((x) => x.views),
                    ...data.periodB.platforms.map((x) => x.views),
                    1
                  );
                  const color = PLATFORM_COLOR[p.platform] ?? "var(--fg-muted)";
                  return (
                    <div
                      key={p.platform}
                      className="cmp-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "140px 1fr 100px",
                        gap: 14,
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--fg)",
                        }}
                      >
                        <span style={{ color }}>
                          <PlatformGlyph platform={p.platform} size={14} />
                        </span>
                        {PLATFORM_LABEL[p.platform] ?? p.platform}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <BarRow label="A" value={p.views} max={max} color={color} strong />
                        <BarRow label="B" value={b?.views ?? 0} max={max} color="var(--border-strong)" />
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {change && change.views !== 0 ? (
                          <>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: change.views > 0 ? "var(--good)" : "var(--bad)",
                              }}
                            >
                              {change.views > 0 ? "+" : ""}
                              {change.views.toFixed(1).replace(/\.0$/, "")}%
                            </div>
                            <div className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)" }}>
                              views
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>no change</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Block>

            {/* By content type — which FORMAT drove the change */}
            {(() => {
              const types = Array.from(
                new Set([
                  ...data.periodA.contentTypes.map((t) => t.type),
                  ...data.periodB.contentTypes.map((t) => t.type),
                ])
              );
              if (types.length < 2) return null;
              const aByType = new Map(data.periodA.contentTypes.map((t) => [t.type, t]));
              const bByType = new Map(data.periodB.contentTypes.map((t) => [t.type, t]));
              const max = Math.max(
                ...data.periodA.contentTypes.map((t) => t.views),
                ...data.periodB.contentTypes.map((t) => t.views),
                1
              );
              types.sort((x, y) => (aByType.get(y)?.views ?? 0) - (aByType.get(x)?.views ?? 0));
              return (
                <Block eyebrow="By content type" title="Which format drove it">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {types.map((type) => {
                      const a = aByType.get(type);
                      const b = bByType.get(type);
                      const delta =
                        (b?.views ?? 0) === 0
                          ? (a?.views ?? 0) > 0 ? 100 : 0
                          : Number(((((a?.views ?? 0) - (b?.views ?? 0)) / (b?.views ?? 1)) * 100).toFixed(1));
                      return (
                        <div
                          key={type}
                          className="cmp-row"
                          style={{ display: "grid", gridTemplateColumns: "140px 1fr 100px", gap: 14, alignItems: "center" }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>
                            {TYPE_LABELS[type] ?? type}
                            <div style={{ fontSize: 10, fontWeight: 500, color: "var(--fg-subtle)" }}>
                              {a?.posts ?? 0} vs {b?.posts ?? 0} posts
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <BarRow label="A" value={a?.views ?? 0} max={max} color="var(--accent)" strong />
                            <BarRow label="B" value={b?.views ?? 0} max={max} color="var(--border-strong)" />
                          </div>
                          <div style={{ textAlign: "right" }}>
                            {delta !== 0 ? (
                              <>
                                <div style={{ fontSize: 13, fontWeight: 700, color: delta > 0 ? "var(--good)" : "var(--bad)" }}>
                                  {delta > 0 ? "+" : ""}
                                  {delta.toFixed(1).replace(/\.0$/, "")}%
                                </div>
                                <div className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)" }}>views</div>
                              </>
                            ) : (
                              <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>no change</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Block>
              );
            })()}

            {/* Top posts per period — the content behind the delta */}
            <Block eyebrow="Top posts" title="What actually drove each period">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
                <TopPostsColumn
                  label={`Period A · ${data.periodA.label}`}
                  color="var(--accent)"
                  posts={data.periodA.topPosts}
                />
                <TopPostsColumn
                  label={`Period B · ${data.periodB.label}`}
                  color="var(--fg-subtle)"
                  posts={data.periodB.topPosts}
                />
              </div>
            </Block>

            {/* Trend overlay */}
            <Block
              eyebrow="Overlay"
              title={`${overlayMetric === "views" ? "Views" : "Engagements"} — Period A vs Period B`}
              sub="Both series normalized to Day 1 – Day N."
              rightSlot={
                <div
                  style={{
                    display: "flex",
                    background: "var(--bg-sunken)",
                    padding: 3,
                    borderRadius: 9,
                    border: "1px solid var(--border)",
                  }}
                >
                  {(["views", "engagements"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setOverlayMetric(m)}
                      style={{
                        padding: "5px 11px",
                        borderRadius: 6,
                        border: "none",
                        background: overlayMetric === m ? "var(--fg)" : "transparent",
                        color: overlayMetric === m ? "var(--bg-elev)" : "var(--fg-muted)",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              }
            >
              <OverlayChart
                seriesA={data.periodA.dailyTrend.map((d) => ({ day: d.day, value: d[overlayMetric] }))}
                seriesB={data.periodB.dailyTrend.map((d) => ({ day: d.day, value: d[overlayMetric] }))}
                labelA={data.periodA.label}
                labelB={data.periodB.label}
              />
            </Block>
          </>
        )}
      </div>
    </>
  );
}

function PeriodChip({
  label,
  color,
  start,
  end,
  onStartChange,
  onEndChange,
  dashed,
}: {
  label: string;
  color: string;
  start: string;
  end: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  dashed?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 8,
        background: "var(--bg-sunken)",
      }}
    >
      <div
        style={{
          width: 18,
          height: 3,
          background: dashed ? "transparent" : color,
          borderTop: dashed ? `2px dashed ${color}` : "none",
        }}
      />
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--fg-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </div>
        {editing ? (
          <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
            <input
              type="date"
              value={start}
              onChange={(e) => onStartChange(e.target.value)}
              style={{
                padding: "2px 6px",
                fontSize: 11,
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--bg-elev)",
                color: "var(--fg)",
              }}
            />
            <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>→</span>
            <input
              type="date"
              value={end}
              onChange={(e) => onEndChange(e.target.value)}
              style={{
                padding: "2px 6px",
                fontSize: 11,
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--bg-elev)",
                color: "var(--fg)",
              }}
            />
            <button
              onClick={() => setEditing(false)}
              style={{
                padding: "2px 8px",
                fontSize: 10,
                borderRadius: 4,
                border: "none",
                background: "var(--fg)",
                color: "var(--bg-elev)",
                fontWeight: 600,
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="mono"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--fg)",
              background: "transparent",
              border: "none",
              padding: 0,
            }}
          >
            {fmtRange(start, end)}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Followers-gained card with coverage-aware UX. Follower tracking only
 * exists from the first daily rollup — a Period B in 2025 has NO data,
 * so instead of a bogus "+100%" we explain when tracking began.
 */
function FollowersCard({
  periodA,
  periodB,
  delta,
}: {
  periodA: PeriodSummary;
  periodB: PeriodSummary;
  delta: number | null;
}) {
  const a = periodA.summary.followersGained;
  const since = periodA.followerCoverage.trackingSince ?? periodB.followerCoverage.trackingSince;
  const sinceLabel = since
    ? new Date(since).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  // No data for Period A at all → explain instead of showing zero.
  if (periodA.followerCoverage.status === "none" || a == null) {
    return (
      <div
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "18px 20px",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 8 }}>Followers gained</div>
        <div style={{ fontSize: 13, color: "var(--fg-subtle)", lineHeight: 1.5 }}>
          No follower data for this period{sinceLabel ? ` — tracking began ${sinceLabel}` : ""}.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "18px 20px",
        position: "relative",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 8 }}>Followers gained</div>
      <div
        className="tnum"
        style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, color: "var(--fg)" }}
      >
        {a >= 0 ? `+${fmtK(a)}` : fmtK(a)}
      </div>
      {delta != null && periodB.summary.followersGained != null ? (
        <DeltaPill delta={delta} sub={`vs +${fmtK(periodB.summary.followersGained)}`} />
      ) : (
        <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 8, lineHeight: 1.4 }}>
          {periodB.followerCoverage.status === "none"
            ? `Period B predates follower tracking${sinceLabel ? ` (began ${sinceLabel})` : ""} — no comparison.`
            : "Partial tracking coverage — comparison suppressed."}
        </div>
      )}
    </div>
  );
}

/** One period's top-5 posts, compact rows: thumb, title, platform, views. */
function TopPostsColumn({
  label,
  color,
  posts,
}: {
  label: string;
  color: string;
  posts: PeriodTopPost[];
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          color: "var(--fg-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 10,
        }}
      >
        <span style={{ width: 14, height: 3, background: color, borderRadius: 2 }} />
        {label}
      </div>
      {posts.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--fg-subtle)", padding: "12px 0" }}>No posts in this period.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {posts.map((p, i) => (
            <a
              key={p.id}
              href={p.contentUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "grid",
                gridTemplateColumns: "18px 38px 1fr 76px",
                gap: 10,
                alignItems: "center",
                padding: "6px 8px",
                borderRadius: 8,
                textDecoration: "none",
                color: "inherit",
                background: "var(--bg-sunken)",
              }}
            >
              <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-subtle)" }}>
                {i + 1}
              </span>
              <span style={{ width: 38, height: 38, borderRadius: 6, overflow: "hidden", background: "var(--bg)", flexShrink: 0, display: "block" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbSrc(p)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    const proxied = thumbProxySrc(p.id);
                    if (!img.src.endsWith(proxied)) img.src = proxied;
                  }}
                />
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--fg)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.title || "Untitled post"}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: PLATFORM_COLOR[p.platform] ?? "var(--fg-subtle)", marginTop: 2 }}>
                  <PlatformGlyph platform={p.platform} size={10} />
                  <span style={{ color: "var(--fg-subtle)" }}>
                    {new Date(p.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </span>
              </span>
              <span style={{ textAlign: "right" }}>
                <span className="tnum" style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--fg)" }}>
                  {fmtK(p.views)}
                </span>
                <span style={{ fontSize: 9.5, color: "var(--fg-subtle)" }}>views</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function DeltaCard({
  label,
  currentValue,
  previousValue,
  delta,
}: {
  label: string;
  currentValue: string;
  previousValue: string;
  delta: number;
}) {
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "18px 20px",
        position: "relative",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 8 }}>{label}</div>
      <div
        className="tnum"
        style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, color: "var(--fg)" }}
      >
        {currentValue}
      </div>
      <DeltaPill delta={delta} sub={`vs ${previousValue}`} />
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
  strong,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "24px 1fr 64px",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)", fontWeight: 600 }}>
        {label}
      </span>
      <div
        style={{
          height: strong ? 12 : 10,
          background: "var(--bg-sunken)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{ height: "100%", width: `${(value / max) * 100}%`, background: color }}
        />
      </div>
      <span
        className="mono tnum"
        style={{
          fontSize: 11,
          fontWeight: strong ? 700 : 500,
          textAlign: "right",
          color: strong ? "var(--fg)" : "var(--fg-muted)",
        }}
      >
        {fmtK(value)}
      </span>
    </div>
  );
}

function OverlayChart({
  seriesA,
  seriesB,
  labelA,
  labelB,
}: {
  seriesA: { day: number; value: number }[];
  seriesB: { day: number; value: number }[];
  labelA: string;
  labelB: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const { pathA, pathB, ticks } = useMemo(() => {
    const h = 280;
    const padL = 42;
    const padR = 14;
    const padT = 18;
    const padB = 28;
    const maxDays = Math.max(seriesA.length, seriesB.length, 2);
    const max = Math.max(...seriesA.map((d) => d.value), ...seriesB.map((d) => d.value), 1);
    const x = (i: number) => padL + (i / (maxDays - 1)) * (w - padL - padR);
    const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);
    const pathA =
      seriesA.length > 0 ? "M" + seriesA.map((d, i) => `${x(i)},${y(d.value)}`).join(" L ") : "";
    const pathB =
      seriesB.length > 0 ? "M" + seriesB.map((d, i) => `${x(i)},${y(d.value)}`).join(" L ") : "";
    const ticks = [0, max * 0.25, max * 0.5, max * 0.75, max];
    return { pathA, pathB, ticks, max, maxDays, x, y, h, padL, padR, padT, padB };
  }, [seriesA, seriesB, w]);

  const h = 280;
  const padL = 42;
  const padR = 14;
  const padT = 18;
  const padB = 28;
  const maxDays = Math.max(seriesA.length, seriesB.length, 2);
  const max = Math.max(...seriesA.map((d) => d.value), ...seriesB.map((d) => d.value), 1);
  const x = (i: number) => padL + (i / (maxDays - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={w - padR}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
              strokeDasharray={i === 0 ? "0" : "2 4"}
            />
            <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--fg-subtle)" className="mono">
              {fmtK(t)}
            </text>
          </g>
        ))}
        <path d={pathB} fill="none" stroke="var(--fg-subtle)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
        <path d={pathA} fill="none" stroke="var(--accent)" strokeWidth="2.2" />
        {seriesA.map(
          (d, i) =>
            (i % Math.max(1, Math.floor(seriesA.length / 8)) === 0 || i === seriesA.length - 1) && (
              <text
                key={i}
                x={x(i)}
                y={h - 8}
                textAnchor="middle"
                fontSize="10"
                fill="var(--fg-subtle)"
                className="mono"
              >
                D{i + 1}
              </text>
            )
        )}
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 18,
          marginTop: 10,
          fontSize: 11,
          color: "var(--fg-muted)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 2, background: "var(--accent)" }} /> {labelA}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 2, background: "var(--fg-subtle)", borderTop: "1px dashed" }} />{" "}
          {labelB}
        </span>
      </div>
    </div>
  );
}
