"use client";

import { fmtK } from "@/lib/format";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface ContentMixDonutProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** Center label (e.g. "1,000 posts") */
  centerLabel?: string;
  centerSub?: string;
}

export default function ContentMixDonut({
  segments,
  size = 140,
  thickness = 20,
  centerLabel,
  centerSub,
}: ContentMixDonutProps) {
  const total = segments.reduce((s, x) => s + x.value, 0);

  if (total === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--fg-muted)", padding: 20, textAlign: "center" }}>
        No posts in this period
      </div>
    );
  }

  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((s) => {
    const len = (s.value / total) * c;
    const node = (
      <circle
        key={s.label}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={s.color}
        strokeWidth={thickness}
        strokeDasharray={`${len} ${c - len}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    );
    offset += len;
    return node;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={thickness}
          />
          {arcs}
        </svg>
        {centerLabel && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div
              className="tnum"
              style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--fg)" }}
            >
              {centerLabel}
            </div>
            {centerSub && (
              <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 2 }}>{centerSub}</div>
            )}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 140, display: "flex", flexDirection: "column", gap: 9 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <div style={{ flex: 1, color: "var(--fg-muted)" }}>{s.label}</div>
            <div className="mono tnum" style={{ fontWeight: 600, color: "var(--fg)" }}>
              {fmtK(s.value)}
            </div>
            <div
              className="mono tnum"
              style={{ color: "var(--fg-subtle)", fontSize: 10, width: 40, textAlign: "right" }}
            >
              {Math.round((s.value / total) * 100)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
