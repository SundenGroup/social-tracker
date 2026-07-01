"use client";

import type { ContentGroup } from "@/hooks/useContentGroups";
import { PlatformGlyph, PLATFORM_COLOR } from "@/components/icons/PlatformGlyph";
import { thumbSrc, thumbProxySrc } from "@/lib/thumb-src";
import { fmtK } from "@/lib/format";

export type ContentMetric = "views" | "engagements" | "rate";

/**
 * Ranked card for one cross-platform content piece — combined metric
 * headline + per-platform mini breakdown. Used by /content's gallery
 * view.
 */
export default function TopContentCard({
  group: g,
  rank,
  metric,
  showProfile,
}: {
  group: ContentGroup;
  rank: number;
  metric: ContentMetric;
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
