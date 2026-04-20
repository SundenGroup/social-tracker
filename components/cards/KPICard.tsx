"use client";

import { Sparkline } from "@/components/ui/Sparkline";
import { DeltaPill } from "@/components/ui/DeltaPill";

interface TrendLegacy {
  value: number;
  isPositive: boolean;
  isAbsolute?: boolean;
}

interface KPICardProps {
  label: string;
  value: string | number;
  subtitle?: string;

  /** New-style delta (percentage, sign matters). Preferred. */
  delta?: number | null;
  /** Sub caption under the delta (e.g. "vs previous 29 days"). */
  deltaSub?: string;

  /** Optional sparkline values */
  sparkline?: number[];
  /** Accent color for the sparkline + the dot next to the label. Defaults to brand red. */
  accent?: string;

  /** Legacy shape (preserved for callers that haven't migrated yet) */
  trend?: TrendLegacy;
}

/**
 * The redesigned KPI card.
 *
 * - Small eyebrow label (optionally with an accent dot)
 * - Big tabular-num value
 * - Delta pill (green/red, with arrow) + sub caption
 * - Optional sparkline in the bottom-right corner
 *
 * Legacy `trend` prop is still supported for pages that haven't been migrated yet.
 */
export default function KPICard({
  label,
  value,
  subtitle,
  delta,
  deltaSub,
  sparkline,
  accent,
  trend,
}: KPICardProps) {
  // Bridge legacy callers into the new delta API so nothing breaks mid-migration
  const effectiveDelta =
    delta ?? (trend ? (trend.isPositive ? trend.value : -trend.value) : null);
  const effectiveDeltaSub = deltaSub ?? (trend?.isAbsolute ? "in period" : trend ? "vs prev" : subtitle);
  const isAbsoluteLegacy = trend?.isAbsolute ?? false;

  const accentColor = accent ?? "var(--accent)";

  return (
    <div
      style={{
        background: "var(--bg-elev)",
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--border)",
        padding: "18px 20px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* soft accent wash top-left */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(120% 80% at 0% 0%, ${accentColor} 0%, transparent 20%)`,
          opacity: 0.05,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--fg-muted)",
          letterSpacing: "0.02em",
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {accent && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
        )}
        {label}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div
            className="tnum"
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              color: "var(--fg)",
            }}
          >
            {value}
          </div>
          {effectiveDelta != null && !Number.isNaN(effectiveDelta) ? (
            <DeltaPill
              delta={effectiveDelta}
              sub={effectiveDeltaSub}
              absolute={isAbsoluteLegacy}
            />
          ) : effectiveDeltaSub ? (
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--fg-subtle)" }}>
              {effectiveDeltaSub}
            </div>
          ) : null}
        </div>

        {sparkline && sparkline.length > 1 && (
          <div style={{ color: accentColor, opacity: 0.9 }}>
            <Sparkline values={sparkline} color={accentColor} width={80} height={36} />
          </div>
        )}
      </div>
    </div>
  );
}
