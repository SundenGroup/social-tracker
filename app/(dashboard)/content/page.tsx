"use client";

import { useState, useEffect, useRef } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TagFilterPills from "@/components/common/TagFilterPills";
import { useDateRange } from "@/hooks/useDateRange";
import { useProfiles } from "@/hooks/useProfiles";
import { useContentGroups, type ContentGroup } from "@/hooks/useContentGroups";
import { UNTAGGED_FILTER, NO_EXTRAS_FILTER } from "@/lib/tagging";
import { PlatformGlyph, PLATFORM_COLOR, Chevron } from "@/components/icons/PlatformGlyph";
import { thumbSrc, thumbProxySrc } from "@/lib/thumb-src";
import { fmtK } from "@/lib/format";

/**
 * Content performance — cross-platform view. Each row is one content
 * piece (the same clip/announcement published on several platforms),
 * with metrics aggregated across ALL of its placements. Grouping is
 * per profile (see lib/content-grouping.ts).
 */
export default function ContentPerformancePage() {
  const { startDate, endDate, setDateRange } = useDateRange();
  const [tags, setTags] = useState<string[]>([]);
  const [multiOnly, setMultiOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
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
  const { data, isLoading, error } = useContentGroups(startDate, endDate, tags, multiOnly);

  // Show the profile column only in org-wide view — inside a single
  // profile it's pure repetition.
  const showProfile = selectedProfileIds.length !== 1;

  useEffect(() => {
    if (tags.length === 0) return;
    const stillValid = tags.filter(
      (t) => t === UNTAGGED_FILTER || t === NO_EXTRAS_FILTER || availableTags.includes(t)
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

  return (
    <>
      <Header title="Content performance" subtitle="One piece, every platform — aggregated">
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
          {/* Summary strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
            <SummaryCell label="Content pieces" value={data.summary.totalGroups} />
            <SummaryCell label="Cross-posted pieces" value={data.summary.multiPlatformGroups} />
            <SummaryCell label="Posts in range" value={data.summary.postsInRange} />
          </div>

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => setMultiOnly((v) => !v)}
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
            <TagFilterPills
              availableTags={availableTags}
              primaryTags={primaryTags}
              tagDisplayNames={tagDisplayNames}
              hasUntaggedPostsInScope={hasUntaggedPostsInScope}
              tags={tags}
              setTags={setTags}
            />
          </div>

          {/* Groups table */}
          <div style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
            {/* Header row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: showProfile
                  ? "minmax(260px, 1fr) 130px 150px 90px 100px 90px 40px"
                  : "minmax(300px, 1fr) 150px 90px 100px 90px 40px",
                gap: 12,
                padding: "10px 16px",
                background: "var(--bg-sunken)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: "var(--fg-subtle)",
              }}
            >
              <div>Content piece</div>
              {showProfile && <div>Profile</div>}
              <div>Platforms</div>
              <div style={{ textAlign: "right" }}>Views</div>
              <div style={{ textAlign: "right" }}>Engagements</div>
              <div style={{ textAlign: "right" }}>Eng. rate</div>
              <div />
            </div>

            {data.groups.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
                No content pieces in this period
              </div>
            )}

            {data.groups.map((g) => (
              <GroupRow
                key={g.groupId}
                group={g}
                showProfile={showProfile}
                expanded={expanded === g.groupId}
                onToggle={() => setExpanded(expanded === g.groupId ? null : g.groupId)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function GroupRow({
  group: g,
  showProfile,
  expanded,
  onToggle,
}: {
  group: ContentGroup;
  showProfile: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Thumbnail: first member that has one (members are pre-sorted by
  // views, so this tends to be the strongest placement's cover).
  const thumbMember = g.members.find((m) => m.thumbnailUrl) ?? g.members[0];
  const maxViews = Math.max(...g.members.map((m) => m.views), 1);

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <div
        onClick={onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: showProfile
            ? "minmax(260px, 1fr) 130px 150px 90px 100px 90px 40px"
            : "minmax(300px, 1fr) 150px 90px 100px 90px 40px",
          gap: 12,
          padding: "10px 16px",
          alignItems: "center",
          cursor: "pointer",
          background: expanded ? "var(--bg-sunken)" : "transparent",
        }}
      >
        {/* Piece: thumb + title + date */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", background: "var(--bg-sunken)", flexShrink: 0 }}>
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
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--fg)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {g.title}
            </div>
            <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 2 }}>
              {new Date(g.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {" · "}
              {g.members.length} post{g.members.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {showProfile && (
          <div style={{ fontSize: 11, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {g.profileName ?? "—"}
          </div>
        )}

        {/* Platform glyphs */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {g.platforms.map((p) => (
            <span key={p} style={{ color: PLATFORM_COLOR[p] ?? "var(--fg-muted)" }} title={p}>
              <PlatformGlyph platform={p} size={14} />
            </span>
          ))}
        </div>

        <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
          {fmtK(g.totalViews)}
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
          {fmtK(g.totalEngagements)}
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
          {g.engagementRate}%
        </div>
        <div style={{ display: "flex", justifyContent: "center", color: "var(--fg-subtle)" }}>
          <Chevron size={13} dir={expanded ? "up" : "down"} />
        </div>
      </div>

      {/* Per-platform breakdown */}
      {expanded && (
        <div style={{ padding: "4px 16px 14px 70px", background: "var(--bg-sunken)" }}>
          {g.members.map((m) => (
            <a
              key={m.id}
              href={m.contentUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 80px 80px 80px 80px",
                gap: 12,
                alignItems: "center",
                padding: "7px 10px",
                borderRadius: 8,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: PLATFORM_COLOR[m.platform] ?? "var(--fg)" }}>
                <PlatformGlyph platform={m.platform} size={13} />
                <span style={{ textTransform: "capitalize" }}>{m.platform === "twitter" ? "X" : m.platform}</span>
              </div>
              {/* Share-of-group bar */}
              <div style={{ height: 6, background: "color-mix(in srgb, var(--border) 60%, transparent)", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.max(2, (m.views / maxViews) * 100)}%`,
                    height: "100%",
                    borderRadius: 4,
                    background: PLATFORM_COLOR[m.platform] ?? "var(--accent)",
                  }}
                />
              </div>
              <Metric label="views" value={m.views} strong />
              <Metric label="likes" value={m.likes} />
              <Metric label="comments" value={m.comments} />
              <Metric label="shares" value={m.shares} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 12, fontWeight: strong ? 700 : 500, color: strong ? "var(--fg)" : "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
        {fmtK(value)}
      </div>
      <div style={{ fontSize: 9, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
    </div>
  );
}
