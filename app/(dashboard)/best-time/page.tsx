"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Header from "@/components/layouts/Header";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TagFilterPills from "@/components/common/TagFilterPills";
import ViewToggle from "@/components/common/ViewToggle";
import { useDashboard } from "@/hooks/useDashboard";
import { useProfiles } from "@/hooks/useProfiles";
import { PlatformGlyph, PLATFORM_COLOR, PLATFORM_LABEL } from "@/components/icons/PlatformGlyph";
import { UNTAGGED_FILTER, NO_EXTRAS_FILTER } from "@/lib/tagging";
import { fmtK } from "@/lib/format";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Lookback presets instead of a free date picker: timing analysis
 *  needs enough posts per slot to be meaningful — short custom ranges
 *  would render a heatmap of noise. */
const LOOKBACKS = [
  { key: "90", label: "90 days" },
  { key: "180", label: "180 days" },
  { key: "365", label: "1 year" },
  { key: "3000", label: "All time" },
];
/** Cells need a minimum sample before we trust (or color) them. */
const MIN_POSTS = 3;

interface Cell {
  count: number;
  medianViews: number;
  totalViews: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Best time to post — computed from the workspace's OWN history: for
 * every published post we bucket (weekday × 2-hour block) in the
 * viewer's local timezone and compare median lifetime views. Posts
 * younger than 7 days are excluded (their numbers haven't settled).
 */
export default function BestTimePage() {
  const [tags, setTags] = useState<string[]>([]);
  const [platform, setPlatform] = useState<string>("all");
  const [lookback, setLookback] = useState("180");
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

  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - Number(lookback) * 86400000);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }, [lookback]);
  const { data, isLoading, error } = useDashboard(startDate, endDate, undefined, tags);

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

  const platformsInData = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.posts.map((p) => p.platform)));
  }, [data]);

  const { grid, best, sampleSize, maxMedian } = useMemo(() => {
    const empty = {
      grid: [] as Cell[][],
      best: [] as Array<{ day: number; block: number; cell: Cell }>,
      sampleSize: 0,
      maxMedian: 0,
    };
    if (!data) return empty;

    const cutoff = Date.now() - 7 * 86400000;
    const posts = data.posts.filter(
      (p) => (platform === "all" || p.platform === platform) && new Date(p.publishedAt).getTime() < cutoff
    );

    // 7 days × 12 two-hour blocks, in the viewer's local timezone.
    const buckets: number[][][] = Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => []));
    for (const p of posts) {
      const d = new Date(p.publishedAt);
      const day = (d.getDay() + 6) % 7; // Mon=0
      const block = Math.floor(d.getHours() / 2);
      buckets[day][block].push(p.views);
    }

    const grid: Cell[][] = buckets.map((row) =>
      row.map((views) => ({
        count: views.length,
        medianViews: median(views),
        totalViews: views.reduce((s, v) => s + v, 0),
      }))
    );

    const ranked: Array<{ day: number; block: number; cell: Cell }> = [];
    grid.forEach((row, day) =>
      row.forEach((cell, block) => {
        if (cell.count >= MIN_POSTS) ranked.push({ day, block, cell });
      })
    );
    ranked.sort((a, b) => b.cell.medianViews - a.cell.medianViews);

    return {
      grid,
      best: ranked.slice(0, 3),
      sampleSize: posts.length,
      maxMedian: Math.max(...ranked.map((r) => r.cell.medianViews), 1),
    };
  }, [data, platform]);

  const blockLabel = (block: number) => `${String(block * 2).padStart(2, "0")}–${String(block * 2 + 2).padStart(2, "0")}`;

  return (
    <>
      <Header
        title="Best time to post"
        subtitle={`Analyzing ${startDate} → ${endDate} · times shown in your timezone`}
      >
        <ViewToggle value={lookback} onChange={setLookback} options={LOOKBACKS} />
      </Header>

      <div className="page-pad" style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Platform tabs + tag filter */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["all", ...platformsInData].map((key) => {
              const active = platform === key;
              const color = key === "all" ? null : PLATFORM_COLOR[key];
              return (
                <button
                  key={key}
                  onClick={() => setPlatform(key)}
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
                    cursor: "pointer",
                  }}
                >
                  {color && (
                    <span style={{ color: active ? "inherit" : color }}>
                      <PlatformGlyph platform={key} size={12} />
                    </span>
                  )}
                  {key === "all" ? "All platforms" : PLATFORM_LABEL[key] ?? key}
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
        {error && <div style={{ color: "var(--bad)", fontSize: 13 }}>{error}</div>}

        {data && (
          <>
            {/* Top slots */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {best.length === 0 && (
                <div style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, fontSize: 13, color: "var(--fg-muted)" }}>
                  Not enough data yet for this filter — need at least {MIN_POSTS} posts per time slot.
                </div>
              )}
              {best.map((slot, i) => (
                <div key={i} style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 14,
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      background: i === 0 ? "var(--accent)" : "var(--bg-sunken)",
                      color: i === 0 ? "#fff" : "var(--fg-muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>
                    {DAYS[slot.day]} {blockLabel(slot.block)}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 4 }}>
                    median <strong style={{ color: "var(--fg)" }}>{fmtK(slot.cell.medianViews)}</strong> views · {slot.cell.count} posts
                  </div>
                </div>
              ))}
            </div>

            {/* Heatmap */}
            <div style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)", marginBottom: 2 }}>
                Median views by publish slot
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginBottom: 14 }}>
                {sampleSize.toLocaleString()} posts analyzed{platform !== "all" ? ` on ${PLATFORM_LABEL[platform] ?? platform}` : ""} · gray = fewer than {MIN_POSTS} posts in slot
              </div>
              <div className="hscroll">
                <table style={{ borderCollapse: "separate", borderSpacing: 3, minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th />
                      {Array.from({ length: 12 }, (_, b) => (
                        <th key={b} style={{ fontSize: 9, color: "var(--fg-subtle)", fontWeight: 600, padding: "0 2px 4px" }}>
                          {blockLabel(b)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.map((row, day) => (
                      <tr key={day}>
                        <td style={{ fontSize: 10.5, fontWeight: 700, color: "var(--fg-muted)", paddingRight: 8 }}>{DAYS[day]}</td>
                        {row.map((cell, block) => {
                          const intensity = cell.count >= MIN_POSTS ? Math.max(cell.medianViews / maxMedian, 0.06) : 0;
                          return (
                            <td
                              key={block}
                              title={
                                cell.count === 0
                                  ? `${DAYS[day]} ${blockLabel(block)} — no posts`
                                  : `${DAYS[day]} ${blockLabel(block)} — ${cell.count} posts, median ${fmtK(cell.medianViews)} views`
                              }
                              style={{
                                width: 40,
                                height: 30,
                                borderRadius: 6,
                                background:
                                  intensity > 0
                                    ? `color-mix(in srgb, var(--accent) ${Math.round(intensity * 88)}%, var(--bg-sunken))`
                                    : "var(--bg-sunken)",
                                textAlign: "center",
                                fontSize: 9,
                                fontWeight: 600,
                                color: intensity > 0.55 ? "#fff" : "var(--fg-subtle)",
                              }}
                            >
                              {cell.count > 0 ? cell.count : ""}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 12, lineHeight: 1.5 }}>
                Color = median lifetime views of posts published in that slot (darker is better); the number is how many
                posts. Posts younger than 7 days are excluded so unfinished numbers don&apos;t skew slots. Correlation
                isn&apos;t causation — big announcements cluster at planned times — but consistent dark columns are a
                real signal.
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
