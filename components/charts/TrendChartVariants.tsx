"use client";

import { useRef, useState, useEffect } from "react";
import { PLATFORM_COLOR, PLATFORM_LABEL, PlatformGlyph, Dot, type Platform } from "@/components/icons/PlatformGlyph";
import { fmtK } from "@/lib/format";

export type ChartVariant = "lines" | "multiples" | "bars";

export interface TrendPoint {
  date: string;
  youtube?: number;
  twitter?: number;
  instagram?: number;
  tiktok?: number;
  vk?: number;
}

const ALL_PLATFORMS: Platform[] = ["youtube", "twitter", "tiktok", "instagram", "vk"];

/**
 * Resolve which platforms a chart should render. Callers pass the
 * profile-aware list (e.g. `activePlatforms` from useProfiles()) so a
 * platform with zero accounts in the current scope doesn't appear in
 * tooltips/legends as "0". Falls back to ALL_PLATFORMS when nothing is
 * provided (e.g. legacy callers or before the profile context loads).
 */
function resolvePlatforms(override?: string[]): Platform[] {
  if (!override || override.length === 0) return ALL_PLATFORMS;
  return ALL_PLATFORMS.filter((p) => override.includes(p));
}

function dayLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function useContainerWidth(initial = 900) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.round(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* ========================================================================
 * Variant 1 — Simple overlaid line graphs (one line per platform)
 * ====================================================================== */

export function LinesChart({ data, height = 280, platforms: platformsOverride }: { data: TrendPoint[]; height?: number; platforms?: string[] }) {
  const [ref, W] = useContainerWidth(900);
  const [hover, setHover] = useState<number | null>(null);
  const h = height;
  const padL = 42;
  const padR = 14;
  const padT = 18;
  const padB = 28;
  const PLATFORMS = resolvePlatforms(platformsOverride);

  if (data.length < 2) return <EmptyChart height={height} />;

  // Scale Y to the max of any single platform's daily value — keeps every
  // line readable on the same axis (no platform disappears in the noise).
  // Treats undefined as no-data (not 0) so days with no posts don't
  // artificially expand the Y axis.
  const maxY = Math.max(
    1,
    ...data.flatMap((d) =>
      PLATFORMS.map((p) => (typeof d[p] === "number" ? (d[p] as number) : 0))
    )
  );

  const x = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / maxY) * (h - padT - padB);
  const ticks = [0, maxY * 0.25, maxY * 0.5, maxY * 0.75, maxY];

  // Build a path per platform. Missing platform values (undefined) on a
  // date become path breaks — we emit a separate sub-path per contiguous
  // run of defined values. Single-point segments still render via the
  // `dots` array so a one-day publish doesn't disappear. Real zeros are
  // preserved (a post that earned 0 views renders at the floor).
  const lines = PLATFORMS.map((p) => {
    const segments: Array<Array<[number, number]>> = [];
    let current: Array<[number, number]> = [];
    for (let i = 0; i < data.length; i++) {
      const raw = data[i][p];
      if (typeof raw !== "number") {
        if (current.length > 0) {
          segments.push(current);
          current = [];
        }
        continue;
      }
      current.push([x(i), y(raw)]);
    }
    if (current.length > 0) segments.push(current);

    // SVG path: "M x,y L x,y L x,y" for each segment. Multi-segment paths
    // separate with another "M …", which renders as a visible gap.
    const linePath = segments
      .map((seg) => "M" + seg.map((pt) => pt.join(",")).join(" L"))
      .join(" ");

    // For single-point segments (e.g. only Apr 4 published, surrounded
    // by gaps), render them as small dots so they're not invisible.
    const isolatedDots = segments.filter((seg) => seg.length === 1).map((seg) => seg[0]);

    // Last defined point (anchor for the terminal dot). Falls back to a
    // safe off-screen position when nothing is defined.
    const last: [number, number] | null =
      segments.length > 0 ? segments[segments.length - 1][segments[segments.length - 1].length - 1] : null;

    return { p, linePath, isolatedDots, last, color: PLATFORM_COLOR[p] ?? "var(--fg-muted)" };
  });

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" height={h}>
        {/* grid */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
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

        {/* hover guide */}
        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={padT}
            y2={h - padB}
            stroke="var(--fg)"
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* lines */}
        {lines.map(({ p, linePath, color }) => (
          <path
            key={p}
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={hover != null && hover !== -1 ? 0.9 : 1}
          />
        ))}

        {/* hover dots on each line — only for platforms that actually
            published on the hovered day. Skipping undefined avoids
            "phantom dots" sitting on the 0 line for non-publishing days. */}
        {hover != null &&
          lines.map(({ p, color }) => {
            const raw = data[hover][p];
            if (typeof raw !== "number") return null;
            return <circle key={`h-${p}`} cx={x(hover)} cy={y(raw)} r="3" fill={color} stroke="var(--bg-elev)" strokeWidth="1.5" />;
          })}

        {/* isolated single-day publish points — without these, a one-day
            segment would have nothing visible (zero-length path). */}
        {lines.flatMap(({ p, isolatedDots, color }) =>
          isolatedDots.map((pt, i) => (
            <circle key={`iso-${p}-${i}`} cx={pt[0]} cy={pt[1]} r="2" fill={color} />
          ))
        )}

        {/* terminal dots — anchor at the last defined point per platform.
            Hidden for platforms that never published in the period. */}
        {lines.map(({ p, last, color }) =>
          last ? <circle key={`last-${p}`} cx={last[0]} cy={last[1]} r="2" fill={color} /> : null
        )}

        {/* x labels */}
        {data.map((d, i) =>
          i % Math.max(1, Math.floor(data.length / 8)) === 0 || i === data.length - 1 ? (
            <text
              key={i}
              x={x(i)}
              y={h - 8}
              textAnchor="middle"
              fontSize="10"
              fill="var(--fg-subtle)"
              className="mono"
            >
              {dayLabel(d.date)}
            </text>
          ) : null
        )}

        {/* wider invisible hit targets for reliable hover */}
        {data.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={x(i) - 10}
            y={padT}
            width="20"
            height={h - padT - padB}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {/* Tooltip — flips to the left of the cursor when we're near the
          right edge of the chart so the box doesn't clip out of view. */}
      {hover != null && (() => {
        const TOOLTIP_W = 200; // approx; matches min-width below + padding
        const flip = x(hover) + TOOLTIP_W + 16 > W;
        return (
        <div
          style={{
            position: "absolute",
            left: `${(x(hover) / W) * 100}%`,
            top: 0,
            transform: flip ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
            background: "var(--bg-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11,
            pointerEvents: "none",
            minWidth: 160,
            boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
            color: "var(--fg)",
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{dayLabel(data[hover].date)}</div>
          {(() => {
            // Show "No posts published" instead of a row of zeros when
            // every platform is undefined for the hovered day. Real
            // zeros (post had 0 views) still render normally.
            const rowsWithData = PLATFORMS.filter((p) => typeof data[hover][p] === "number");
            if (rowsWithData.length === 0) {
              return (
                <div style={{ color: "var(--fg-subtle)", fontSize: 11, fontStyle: "italic" }}>
                  No posts published
                </div>
              );
            }
            const total = rowsWithData.reduce((s, p) => s + (data[hover][p] as number), 0);
            return (
              <>
                {rowsWithData.map((p) => (
                  <div
                    key={p}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      color: "var(--fg-muted)",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Dot size={6} color={PLATFORM_COLOR[p] ?? "var(--fg-muted)"} /> {PLATFORM_LABEL[p]}
                    </span>
                    <span className="mono tnum" style={{ color: "var(--fg)" }}>
                      {fmtK(data[hover][p] as number)}
                    </span>
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: "1px solid var(--border)",
                    fontWeight: 700,
                  }}
                >
                  <span>Total</span>
                  <span className="mono tnum">{fmtK(total)}</span>
                </div>
              </>
            );
          })()}
        </div>
        );
      })()}
    </div>
  );
}

/* ========================================================================
 * Variant 2 — Small multiples (one mini area chart per platform)
 * ====================================================================== */

export function SmallMultiplesChart({ data, height = 180, platforms: platformsOverride }: { data: TrendPoint[]; height?: number; platforms?: string[] }) {
  const PLATFORMS = resolvePlatforms(platformsOverride);
  if (data.length < 2) return <EmptyChart height={height} />;

  return (
    <div className="row row-4">
      {PLATFORMS.map((p) => {
        // Treat undefined as gap (no posts that day), 0 as a real zero.
        const definedValues = data
          .map((d) => d[p])
          .filter((v): v is number => typeof v === "number");
        const max = Math.max(...definedValues, 1);
        const color = PLATFORM_COLOR[p] ?? "var(--fg-muted)";
        const total = definedValues.reduce((s, v) => s + v, 0);
        const w = 280;
        const h = height;
        const padX = 8;
        const padY = 14;
        const xPos = (i: number) => padX + (i / (data.length - 1)) * (w - padX * 2);
        const yPos = (v: number) => h - padY - (v / max) * (h - padY * 2);

        // Segmented sub-paths so gap days break the line (no fake zeros).
        const segments: Array<Array<[number, number]>> = [];
        let current: Array<[number, number]> = [];
        for (let i = 0; i < data.length; i++) {
          const raw = data[i][p];
          if (typeof raw !== "number") {
            if (current.length > 0) {
              segments.push(current);
              current = [];
            }
            continue;
          }
          current.push([xPos(i), yPos(raw)]);
        }
        if (current.length > 0) segments.push(current);
        const linePath = segments
          .map((seg) => "M" + seg.map((pt) => pt.join(",")).join(" L"))
          .join(" ");
        const areaPaths = segments
          .filter((seg) => seg.length >= 2)
          .map((seg) => {
            const path = "M" + seg.map((pt) => pt.join(",")).join(" L");
            return path + ` L ${seg[seg.length - 1][0]},${h - padY} L ${seg[0][0]},${h - padY} Z`;
          });
        const lastDefined: [number, number] | null =
          segments.length > 0 ? segments[segments.length - 1][segments[segments.length - 1].length - 1] : null;

        return (
          <div
            key={p}
            style={{
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "14px 14px 8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ color }}>
                <PlatformGlyph platform={p} size={14} />
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--fg-muted)",
                }}
              >
                {PLATFORM_LABEL[p]}
              </span>
              <span className="mono tnum" style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-subtle)" }}>
                {fmtK(total)}
              </span>
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
              {areaPaths.map((d, i) => (
                <path key={`a-${i}`} d={d} fill={color} opacity="0.12" />
              ))}
              <path d={linePath} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
              {/* Single-point segments (one publish day surrounded by gaps)
                  need explicit dots; the path alone wouldn't render. */}
              {segments
                .filter((seg) => seg.length === 1)
                .map((seg, i) => (
                  <circle key={`iso-${i}`} cx={seg[0][0]} cy={seg[0][1]} r="1.8" fill={color} />
                ))}
              {lastDefined && (
                <circle cx={lastDefined[0]} cy={lastDefined[1]} r="1.8" fill={color} />
              )}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

/* ========================================================================
 * Variant 3 — Stacked per-platform bars, with spike annotations + hover
 * ====================================================================== */

export function AnnotatedBarsChart({ data, height = 280, platforms: platformsOverride }: { data: TrendPoint[]; height?: number; platforms?: string[] }) {
  const PLATFORMS = resolvePlatforms(platformsOverride);
  const [ref, W] = useContainerWidth(900);
  const [hover, setHover] = useState<number | null>(null);
  const h = height;
  const padL = 42;
  const padR = 14;
  // Top padding has to reserve enough headroom for spike annotation labels
  // (which sit 46 px above the bar top). Otherwise a spike on the tallest
  // bar gets its label clipped by the SVG edge.
  const padT = 56;
  const padB = 28;

  if (data.length < 2) return <EmptyChart height={height} />;

  const totals = data.map((d) => PLATFORMS.reduce((s, p) => s + ((d[p] as number | undefined) ?? 0), 0));
  const maxY = Math.max(...totals, 1);
  const step = (W - padL - padR) / data.length;
  const barW = Math.max(6, step - 4);
  const x = (i: number) => padL + 2 + i * step;
  const y = (v: number) => padT + (1 - v / maxY) * (h - padT - padB);
  const ticks = [0, maxY * 0.5, maxY];
  const spikes = data
    .map((d, i) => ({ i, total: totals[i], day: dayLabel(d.date) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 2);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" height={h}>
        {/* y-axis ticks */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--fg-subtle)" className="mono">
              {fmtK(t)}
            </text>
          </g>
        ))}

        {/* Hover guideline */}
        {hover != null && (
          <line
            x1={x(hover) + barW / 2}
            x2={x(hover) + barW / 2}
            y1={padT}
            y2={h - padB}
            stroke="var(--fg)"
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Stacked per-platform bars */}
        {data.map((d, i) => {
          let acc = 0;
          return (
            <g key={i} opacity={hover != null && hover !== i ? 0.7 : 1}>
              {PLATFORMS.map((p) => {
                const v = (d[p] as number | undefined) ?? 0;
                const yTop = y(acc + v);
                const yBot = y(acc);
                acc += v;
                return (
                  <rect
                    key={p}
                    x={x(i)}
                    y={yTop}
                    width={barW}
                    height={Math.max(1, yBot - yTop)}
                    fill={PLATFORM_COLOR[p] ?? "var(--fg-muted)"}
                    opacity="0.95"
                  />
                );
              })}
            </g>
          );
        })}

        {/* Spike annotations — clamped so the label never renders off-screen */}
        {spikes.map((s) => {
          const cx = x(s.i) + barW / 2;
          const labelW = 100;
          // Keep the whole rect inside the chart area horizontally
          const labelCx = Math.max(padL + labelW / 2, Math.min(W - padR - labelW / 2, cx));
          return (
            <g key={s.i} pointerEvents="none">
              <line
                x1={cx}
                x2={cx}
                y1={y(s.total) - 6}
                y2={y(s.total) - 24}
                stroke="var(--accent)"
                strokeWidth="1.5"
              />
              <circle cx={cx} cy={y(s.total) - 6} r="3" fill="var(--accent)" />
              <rect
                x={labelCx - labelW / 2}
                y={y(s.total) - 46}
                width={labelW}
                height="22"
                rx="4"
                fill="var(--accent)"
              />
              <text
                x={labelCx}
                y={y(s.total) - 31}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="#fff"
              >
                {fmtK(s.total)} · {s.day}
              </text>
            </g>
          );
        })}

        {/* x-axis labels */}
        {data.map((d, i) =>
          i % Math.max(1, Math.floor(data.length / 8)) === 0 || i === data.length - 1 ? (
            <text
              key={i}
              x={x(i) + barW / 2}
              y={h - 8}
              textAnchor="middle"
              fontSize="10"
              fill="var(--fg-subtle)"
              className="mono"
            >
              {dayLabel(d.date)}
            </text>
          ) : null
        )}

        {/* Wider invisible hit targets so hover is reliable even on narrow bars */}
        {data.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={padL + i * step}
            y={padT}
            width={step}
            height={h - padT - padB}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {/* Hover tooltip — flips to the left of the bar when we're near
          the right edge of the chart so the box doesn't clip out of view. */}
      {hover != null && (() => {
        const TOOLTIP_W = 200; // approx; matches min-width below + padding
        const cursorX = x(hover) + barW / 2;
        const flip = cursorX + TOOLTIP_W + 16 > W;
        return (
        <div
          style={{
            position: "absolute",
            left: `${(cursorX / W) * 100}%`,
            top: 0,
            transform: flip ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
            background: "var(--bg-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11,
            pointerEvents: "none",
            minWidth: 160,
            boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
            color: "var(--fg)",
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{dayLabel(data[hover].date)}</div>
          {PLATFORMS.map((p) => (
            <div
              key={p}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                color: "var(--fg-muted)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Dot size={6} color={PLATFORM_COLOR[p] ?? "var(--fg-muted)"} /> {PLATFORM_LABEL[p]}
              </span>
              <span className="mono tnum" style={{ color: "var(--fg)" }}>
                {fmtK((data[hover][p] as number | undefined) ?? 0)}
              </span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 6,
              paddingTop: 6,
              borderTop: "1px solid var(--border)",
              fontWeight: 700,
            }}
          >
            <span>Total</span>
            <span className="mono tnum">{fmtK(totals[hover])}</span>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

/* ========================================================================
 * Single-platform trend (used on platform detail pages)
 * ====================================================================== */

export function SinglePlatformChart({
  data,
  platform,
  height = 280,
}: {
  data: TrendPoint[];
  platform: Platform;
  height?: number;
}) {
  const [ref, W] = useContainerWidth(900);
  const h = height;
  const padL = 42;
  const padR = 14;
  const padT = 18;
  const padB = 28;

  if (data.length < 2) return <EmptyChart height={height} />;

  const color = PLATFORM_COLOR[platform] ?? "var(--accent)";
  // Treat undefined as no-data (gap), 0 as a real zero. Y-axis only
  // scales to days that actually had posts.
  const max = Math.max(
    1,
    ...data.map((d) => (typeof d[platform] === "number" ? (d[platform] as number) : 0))
  );
  const x = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);
  const ticks = [0, max * 0.5, max];

  // Build line and area paths as multiple sub-paths separated by gaps
  // wherever the platform had no posts that day. Without segmentation,
  // missing days collapse to the floor and the line drops to 0.
  const segments: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  for (let i = 0; i < data.length; i++) {
    const raw = data[i][platform];
    if (typeof raw !== "number") {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      continue;
    }
    current.push([x(i), y(raw)]);
  }
  if (current.length > 0) segments.push(current);

  const linePath = segments
    .map((seg) => "M" + seg.map((pt) => pt.join(",")).join(" L"))
    .join(" ");
  // Per-segment area paths so gap days don't get filled with the
  // platform color.
  const areaPaths = segments
    .filter((seg) => seg.length >= 2)
    .map((seg) => {
      const path = "M" + seg.map((pt) => pt.join(",")).join(" L");
      return path + ` L ${seg[seg.length - 1][0]},${h - padB} L ${seg[0][0]},${h - padB} Z`;
    });

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" height={h}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
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
        {areaPaths.map((d, i) => (
          <path key={`a-${i}`} d={d} fill={color} opacity="0.14" />
        ))}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.2" />
        {/* dots on every defined point (capped to a reasonable density) */}
        {segments.flatMap((seg, segIdx) =>
          seg.map((pt, ptIdx) => {
            // Always show isolated points and segment endpoints; for
            // longer segments thin the dots so the line stays clean.
            const isEndpoint = ptIdx === 0 || ptIdx === seg.length - 1;
            const showAlways = seg.length === 1 || isEndpoint;
            if (!showAlways && ptIdx % 4 !== 0) return null;
            return <circle key={`${segIdx}-${ptIdx}`} cx={pt[0]} cy={pt[1]} r="2.5" fill={color} />;
          })
        )}
        {data.map((d, i) =>
          i % Math.max(1, Math.floor(data.length / 8)) === 0 || i === data.length - 1 ? (
            <text
              key={i}
              x={x(i)}
              y={h - 8}
              textAnchor="middle"
              fontSize="10"
              fill="var(--fg-subtle)"
              className="mono"
            >
              {dayLabel(d.date)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

/* ========================================================================
 * Empty state
 * ====================================================================== */

function EmptyChart({ height }: { height: number }) {
  return (
    <div
      style={{
        height,
        display: "grid",
        placeItems: "center",
        color: "var(--fg-subtle)",
        fontSize: 12,
      }}
    >
      Not enough data yet to chart. Check back after the next sync.
    </div>
  );
}

/* ========================================================================
 * Legend + switcher
 * ====================================================================== */

export function ChartLegend({ platforms: platformsOverride }: { platforms?: string[] } = {}) {
  const PLATFORMS = resolvePlatforms(platformsOverride);
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        justifyContent: "center",
        marginTop: 8,
        fontSize: 11,
        color: "var(--fg-muted)",
        flexWrap: "wrap",
      }}
    >
      {PLATFORMS.map((p) => (
        <div key={p} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Dot size={8} color={PLATFORM_COLOR[p] ?? "var(--fg-muted)"} /> {PLATFORM_LABEL[p]}
        </div>
      ))}
    </div>
  );
}

export function ChartVariantSwitcher({
  value,
  onChange,
}: {
  value: ChartVariant;
  onChange: (v: ChartVariant) => void;
}) {
  const opts: { k: ChartVariant; l: string }[] = [
    { k: "lines", l: "Lines" },
    { k: "multiples", l: "Per platform" },
    { k: "bars", l: "Bars" },
  ];
  return (
    <div
      style={{
        display: "flex",
        background: "var(--bg-sunken)",
        padding: 3,
        borderRadius: 8,
        border: "1px solid var(--border)",
      }}
    >
      {opts.map((o) => (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          style={{
            padding: "5px 10px",
            borderRadius: 6,
            border: "none",
            background: value === o.k ? "var(--bg-elev)" : "transparent",
            boxShadow: value === o.k ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
            color: value === o.k ? "var(--fg)" : "var(--fg-muted)",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
