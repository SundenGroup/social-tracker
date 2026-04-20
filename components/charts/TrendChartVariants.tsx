"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { PLATFORM_COLOR, PLATFORM_LABEL, PlatformGlyph, Dot, type Platform } from "@/components/icons/PlatformGlyph";
import { fmtK } from "@/lib/format";

export type ChartVariant = "stacked" | "multiples" | "bars";

export interface TrendPoint {
  date: string;
  youtube?: number;
  twitter?: number;
  instagram?: number;
  tiktok?: number;
}

const PLATFORMS: Platform[] = ["youtube", "twitter", "tiktok", "instagram"];

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
 * Variant 1 — Stacked smooth area (default)
 * ====================================================================== */

export function StackedSmoothChart({ data, height = 280 }: { data: TrendPoint[]; height?: number }) {
  const [ref, W] = useContainerWidth(900);
  const h = height;
  const padL = 42;
  const padR = 14;
  const padT = 18;
  const padB = 28;

  const stacked = useMemo(() => {
    return data.map((d) => {
      let acc = 0;
      const out: Record<string, number | string> = { date: d.date, day: dayLabel(d.date) };
      for (const p of PLATFORMS) {
        const v = d[p] as number | undefined;
        acc += v ?? 0;
        out[`${p}_top`] = acc;
        out[`${p}_val`] = v ?? 0;
      }
      out.total = acc;
      return out;
    });
  }, [data]);

  if (data.length < 2) {
    return <EmptyChart height={height} />;
  }

  const maxY = Math.max(...stacked.map((d) => d.total as number), 1);
  const x = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / maxY) * (h - padT - padB);
  const ticks = [0, maxY * 0.25, maxY * 0.5, maxY * 0.75, maxY];

  const areas = PLATFORMS.map((p, idx) => {
    const topKey = `${p}_top`;
    const prev = idx > 0 ? `${PLATFORMS[idx - 1]}_top` : null;
    const topPath = stacked.map((d, i) => `${x(i)},${y(d[topKey] as number)}`).join(" L ");
    const basePath = prev
      ? stacked
          .slice()
          .reverse()
          .map((d, i) => `${x(stacked.length - 1 - i)},${y(d[prev] as number)}`)
          .join(" L ")
      : `${x(stacked.length - 1)},${y(0)} L ${x(0)},${y(0)}`;
    return { p, d: `M ${topPath} L ${basePath} Z` };
  });

  const [hover, setHover] = useState<number | null>(null);

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
        {/* areas */}
        {areas.map((a) => (
          <path key={a.p} d={a.d} fill={PLATFORM_COLOR[a.p] ?? "var(--fg-muted)"} opacity="0.85" />
        ))}
        {/* top stroke */}
        <path
          d={"M " + stacked.map((d, i) => `${x(i)},${y(d.total as number)}`).join(" L ")}
          fill="none"
          stroke="var(--fg)"
          strokeOpacity="0.3"
          strokeWidth="1"
        />
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
        {/* hover */}
        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={padT}
            y2={h - padB}
            stroke="var(--fg)"
            strokeOpacity="0.5"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        {/* hit targets */}
        {data.map((d, i) => (
          <rect
            key={i}
            x={x(i) - 8}
            y={padT}
            width="16"
            height={h - padT - padB}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
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
              {fmtK(
                PLATFORMS.reduce((s, p) => s + ((data[hover][p] as number | undefined) ?? 0), 0)
              )}
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
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
 * Variant 3 — Annotated stacked bars
 * ====================================================================== */

export function AnnotatedBarsChart({ data, height = 280 }: { data: TrendPoint[]; height?: number }) {
  const [ref, W] = useContainerWidth(900);
  const h = height;
  const padL = 42;
  const padR = 14;
  const padT = 28;
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
    <div ref={ref} style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" height={h}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--fg-subtle)" className="mono">
              {fmtK(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          let acc = 0;
          return (
            <g key={i}>
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
        {/* Spike annotations */}
        {spikes.map((s) => (
          <g key={s.i}>
            <line
              x1={x(s.i) + barW / 2}
              x2={x(s.i) + barW / 2}
              y1={y(s.total) - 6}
              y2={y(s.total) - 24}
              stroke="var(--accent)"
              strokeWidth="1.5"
            />
            <circle cx={x(s.i) + barW / 2} cy={y(s.total) - 6} r="3" fill="var(--accent)" />
            <rect x={x(s.i) + barW / 2 - 50} y={y(s.total) - 46} width="100" height="22" rx="4" fill="var(--accent)" />
            <text
              x={x(s.i) + barW / 2}
              y={y(s.total) - 31}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#fff"
            >
              {fmtK(s.total)} · {s.day}
            </text>
          </g>
        ))}
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
      </svg>
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
    { k: "stacked", l: "Stacked" },
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
