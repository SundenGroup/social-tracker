"use client";

import { ArrowDownIcon, ArrowUpIcon } from "@/components/icons/PlatformGlyph";

interface DeltaPillProps {
  /** The delta percentage (e.g. 28.5 for +28.5%). Sign determines up/down. */
  delta: number | null | undefined;
  /** Optional secondary text shown after the pill (e.g. "vs previous 29 days") */
  sub?: string;
  /** Render the delta as an absolute number instead of a percentage */
  absolute?: boolean;
  /** Suffix (e.g. "%") appended to absolute values */
  absoluteSuffix?: string;
  /** Custom formatter for the value inside the pill */
  format?: (n: number) => string;
  className?: string;
}

/**
 * Green/red arrow pill showing a period-over-period change.
 * Used in KPI cards, comparison cards, platform hero.
 */
export function DeltaPill({ delta, sub, absolute, absoluteSuffix = "", format, className }: DeltaPillProps) {
  if (delta == null || Number.isNaN(delta)) {
    return sub ? (
      <div className={className} style={{ marginTop: 10, fontSize: 11, color: "var(--fg-subtle)" }}>
        {sub}
      </div>
    ) : null;
  }

  const positive = delta >= 0;
  const display = format
    ? format(Math.abs(delta))
    : absolute
    ? Math.abs(delta).toLocaleString() + absoluteSuffix
    : Math.abs(delta).toFixed(1).replace(/\.0$/, "") + "%";

  return (
    <div className={className} style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          padding: "2px 6px",
          borderRadius: 5,
          background: positive
            ? "color-mix(in srgb, var(--good) 12%, transparent)"
            : "color-mix(in srgb, var(--bad) 12%, transparent)",
          color: positive ? "var(--good)" : "var(--bad)",
          fontWeight: 700,
        }}
      >
        {positive ? <ArrowUpIcon /> : <ArrowDownIcon />}
        {display}
      </span>
      {sub && <span style={{ color: "var(--fg-subtle)" }}>{sub}</span>}
    </div>
  );
}
