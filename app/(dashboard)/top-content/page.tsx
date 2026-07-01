"use client";

import { useMemo, useState } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useDateRange } from "@/hooks/useDateRange";
import { useProfiles } from "@/hooks/useProfiles";
import { useContentGroups, type ContentGroup } from "@/hooks/useContentGroups";
import { PlatformGlyph, PLATFORM_COLOR } from "@/components/icons/PlatformGlyph";
import { thumbSrc, thumbProxySrc } from "@/lib/thumb-src";
import { fmtK } from "@/lib/format";

type Metric = "views" | "engagements" | "rate";

const METRIC_TABS: Array<{ key: Metric; label: string }> = [
  { key: "views", label: "Views" },
  { key: "engagements", label: "Engagements" },
  { key: "rate", label: "Eng. rate" },
];

/**
 * Top content — the best-performing content PIECES, ranked by their
 * combined numbers across every platform they were published on.
 * Complements Top posts (which ranks individual platform posts).
 */
export default function TopContentPage() {
  const { startDate, endDate, setDateRange } = useDateRange();
  const [metric, setMetric] = useState<Metric>("views");
  const [multiOnly, setMultiOnly] = useState(true);
  const { selectedProfileIds } = useProfiles();
  const { data, isLoading, error } = useContentGroups(startDate, endDate, undefined, multiOnly);

  const showProfile = selectedProfileIds.length !== 1;

  const ranked = useMemo(() => {
    if (!data) return [];
    const list = [...data.groups];
    if (metric === "engagements") list.sort((a, b) => b.totalEngagements - a.totalEngagements);
    else if (metric === "rate") list.sort((a, b) => b.engagementRate - a.engagementRate);
    // "views" is the API's default order already, but keep it explicit
    else list.sort((a, b) => b.totalViews - a.totalViews);
    return list.slice(0, 24);
  }, [data, metric]);

  return (
    <>
      <Header title="Top content" subtitle="Best pieces across all platforms combined">
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s, e) => setDateRange(s, e)} />
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
          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {METRIC_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setMetric(t.key)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: metric === t.key ? "var(--fg)" : "var(--bg-elev)",
                    color: metric === t.key ? "var(--bg-elev)" : "var(--fg-muted)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMultiOnly((v) => !v)}
              title="Only show pieces published on 2+ platforms"
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: multiOnly ? "var(--accent)" : "var(--bg-elev)",
                color: multiOnly ? "#fff" : "var(--fg-muted)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cross-posted only
            </button>
          </div>

          {ranked.length === 0 ? (
            <div style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 14, padding: 40, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
              No content pieces in this period
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {ranked.map((g, i) => (
                <TopContentCard key={g.groupId} group={g} rank={i + 1} metric={metric} showProfile={showProfile} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function TopContentCard({
  group: g,
  rank,
  metric,
  showProfile,
}: {
  group: ContentGroup;
  rank: number;
  metric: Metric;
  showProfile: boolean;
}) {
  const thumbMember = g.members.find((m) => m.thumbnailUrl) ?? g.members[0];
  const big =
    metric === "views" ? fmtK(g.totalViews) : metric === "engagements" ? fmtK(g.totalEngagements) : `${g.engagementRate}%`;
  const bigLabel = metric === "views" ? "combined views" : metric === "engagements" ? "combined engagements" : "eng. rate";
  const topMember = g.members[0]; // pre-sorted by views

  return (
    <a
      href={topMember?.contentUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        overflow: "hidden",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ position: "relative", aspectRatio: "16 / 10", background: "var(--bg-sunken)" }}>
        {thumbMember && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc(thumbMember)}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              const proxied = thumbProxySrc(thumbMember.id);
              if (!img.src.endsWith(proxied)) img.src = proxied;
            }}
          />
        )}
        {/* Rank badge */}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            width: 26,
            height: 26,
            borderRadius: 8,
            background: rank <= 3 ? "var(--accent)" : "rgba(0,0,0,0.55)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {rank}
        </div>
        {/* Platform count badge */}
        {g.platforms.length >= 2 && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {g.platforms.length} platforms
          </div>
        )}
      </div>

      <div style={{ padding: "10px 12px 12px" }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--fg)",
            lineHeight: 1.35,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: 34,
          }}
        >
          {g.title}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>{big}</span>
          <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>{bigLabel}</span>
        </div>

        {/* Per-platform mini breakdown */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 8 }}>
          {g.members.map((m) => (
            <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--fg-muted)" }}>
              <span style={{ color: PLATFORM_COLOR[m.platform] ?? "var(--fg-muted)" }}>
                <PlatformGlyph platform={m.platform} size={11} />
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtK(m.views)}</span>
            </span>
          ))}
        </div>

        <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 8 }}>
          {new Date(g.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {showProfile && g.profileName ? ` · ${g.profileName}` : ""}
        </div>
      </div>
    </a>
  );
}
