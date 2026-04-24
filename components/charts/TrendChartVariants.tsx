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

const PLATFORMS: Platform[] = ["youtube", "twitter", "tiktok", "instagram", "vk"];

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

export function LinesChart({ data, height = 280 }: { data: TrendPoint[]; height?: number }) {
  const [ref, W] = useContainerWidth(900);
  const [hover, setHover] = useState<number | null>(null);
  const h = height;
  const padL = 42;
  const padR = 14;
  const padT = 18;
  const padB = 28;

  if (data.length < 2) return <EmptyChart height={height} />;

  // Scale Y to the max of any single platform's daily value — keeps every
  // line readable on the same axis (no platform disappears in the noise).
  const maxY = Math.max(
    1,
    ...data.flatMap((d) => PLATFORMS.map((p) => (d[p] as number | undefined) ?? 0))
  );

  const x = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / maxY) * (h - padT - padB);
  const ticks = [0, maxY * 0.25, maxY * 0.5, maxY * 0.75, maxY];

  // Build a path per platform
  const lines = PLATFORMS.map((p) => {
    const values = data.map((d) => (d[p] as number | undefined) ?? 0);
    const pts = values.map((v, i): [number, number] => [x(i), y(v)]);
    const linePath = "M" + pts.map((pt) => pt.join(",")).join(" L");
    const last = pts[pts.length - 1];
    return { p, linePath, last, color: PLATFORM_COLOR[p] ?? "var(--fg-muted)" };
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

        {/* hover dots on each line */}
        {hover != null &&
          lines.map(({ p, color }) => {
            const v = (data[hover][p] as number | undefined) ?? 0;
            return <circle key={`h-${p}`} cx={x(hover)} cy={y(v)} r="3" fill={color} stroke="var(--bg-elev)" strokeWidth="1.5" />;
          })}

        {/* terminal dots */}
        {lines.map(({ p, last, color }) => (
          <circle key={`last-${p}`} cx={last[0]} cy={last[1]} r="2" fill={color} />
        ))}

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

      {/* Tooltip */}
      {hover != null && (
        <div
          style={{
            position: "absolute",
            left: `${(x(hover) / W) * 100}%`,
            top: 0,
            transform: "translateX(8px)",
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
            <span className="mono tnum">
              {fmtK(PLATFORMS.reduce((s, p) => s + ((data[hover][p] as number | undefined) ?? 0), 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================================================
 * Variant 2 — Small multiples (one mini area chart per platform)
 * ====================================================================== */

export function SmallMultiplesChart({ data, height = 180 }: { data: TrendPoint[]; height?: number }) {
  if (data.length < 2) return <EmptyChart height={height} />;

  return (
    <div className="row row-4">
      {PLATFORMS.map((p) => {
        const values = data.map((d) => (d[p] as number | undefined) ?? 0);
        const max = Math.max(...values, 1);
        const color = PLATFORM_COLOR[p] ?? "var(--fg-muted)";
        const total = values.reduce((s, v) => s + v, 0);
        const w = 280;
        const h = height;
        const padX = 8;
        const padY = 14;
        const pts = values.map((v, i): [number, number] => [
          padX + (i / (values.length - 1)) * (w - padX * 2),
          h - padY - (v / max) * (h - padY * 2),
        ]);
        const linePath = "M" + pts.map((pt) => pt.join(",")).join(" L");
        const areaPath = linePath + ` L ${pts[pts.length - 1][0]},${h - padY} L ${pts[0][0]},${h - padY} Z`;

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
              <path d={areaPath} fill={color} opacity="0.12" />
              <path d={linePath} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
              <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="1.8" fill={color} />
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

export function AnnotatedBarsChart({ data, height = 280 }: { data: TrendPoint[]; height?: number }) {
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

      {/* Hover tooltip */}
      {hover != null && (
        <div
          style={{
            position: "absolute",
            left: `${((x(hover) + barW / 2) / W) * 100}%`,
            top: 0,
            transform: "translateX(8px)",
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
      )}
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
  const values = data.map((d) => (d[platform] as number | undefined) ?? 0);
  const max = Math.max(...values, 1);
  const x = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);
  const pts = values.map((v, i): [number, number] => [x(i), y(v)]);
  const linePath = "M" + pts.map((pt) => pt.join(",")).join(" L");
  const areaPath = linePath + ` L ${pts[pts.length - 1][0]},${h - padB} L ${pts[0][0]},${h - padB} Z`;
  const ticks = [0, max * 0.5, max];

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
        <path d={areaPath} fill={color} opacity="0.14" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.2" />
        {pts.map(([px, py], i) =>
          i % 4 === 0 || i === pts.length - 1 ? <circle key={i} cx={px} cy={py} r="2.5" fill={color} /> : null
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

export function ChartLegend() {
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
