"use client";

import Link from "next/link";
import { PlatformGlyph, PLATFORM_COLOR, PLATFORM_LABEL, type Platform } from "@/components/icons/PlatformGlyph";
import { Sparkline } from "@/components/ui/Sparkline";
import { fmtK } from "@/lib/format";

export interface PlatformStripItem {
  platform: string;
  views: number;
  engagements: number;
  followers?: number;
  followerGrowth?: number;
  engagementRate?: number;
  topPost?: string | null;
  /** Sparkline values (per-day views over the selected period). Optional. */
  sparkline?: number[];
  handle?: string | null;
}

interface PlatformStripProps {
  items: PlatformStripItem[];
  /** Link target pattern; `{platform}` is substituted */
  hrefPattern?: string;
}

/**
 * Connected 4-card horizontal strip — fixes the "disconnected / wasted space"
 * feedback on the old layout. Each card has a 3px brand-colored top rule.
 */
export default function PlatformStrip({ items, hrefPattern = "/platforms/{platform}" }: PlatformStripProps) {
  // Preferred display order
  const order: Platform[] = ["tiktok", "youtube", "twitter", "instagram"];
  const byPlatform = new Map(items.map((i) => [i.platform, i]));
  const ordered = order
    .map((p) => byPlatform.get(p))
    .filter((i): i is PlatformStripItem => i != null);

  // If the API returns platforms not in our preferred order, append them
  for (const item of items) {
    if (!order.includes(item.platform as Platform)) ordered.push(item);
  }

  if (ordered.length === 0) return null;

  return (
    <div className={ordered.length === 4 ? "row row-4" : "row"} style={ordered.length !== 4 ? { gridTemplateColumns: `repeat(${ordered.length}, minmax(0, 1fr))` } : undefined}>
      {ordered.map((item) => {
        const color = PLATFORM_COLOR[item.platform] ?? "var(--fg-muted)";
        const label = PLATFORM_LABEL[item.platform] ?? item.platform;
        const href = hrefPattern.replace("{platform}", item.platform);

        return (
          <Link
            key={item.platform}
            href={href}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div
              style={{
                background: "var(--bg-elev)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 18,
                paddingTop: 21,
                position: "relative",
                overflow: "hidden",
                transition: "transform .15s, box-shadow .15s",
              }}
            >
              {/* 3px brand-colored top rule */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: color,
                }}
              />

              {/* Header row: glyph + label + handle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color, display: "flex" }}>
                    <PlatformGlyph platform={item.platform} size={18} />
                  </span>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--fg)" }}>{label}</div>
                </div>
                {item.handle && (
                  <span className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)" }}>
                    {item.handle}
                  </span>
                )}
              </div>

              {/* Big views number + sparkline */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <div>
                  <div
                    className="tnum"
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                      color: "var(--fg)",
                    }}
                  >
                    {fmtK(item.views)}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 2 }}>Views</div>
                </div>
                {item.sparkline && item.sparkline.length > 1 && (
                  <div style={{ color }}>
                    <Sparkline values={item.sparkline} color={color} width={90} height={26} />
                  </div>
                )}
              </div>

              {/* Tiny stats row, divided */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 4,
                  fontSize: 11,
                  paddingTop: 10,
                  borderTop: "1px dashed var(--border)",
                }}
              >
                <MiniStat label="Eng." value={fmtK(item.engagements)} />
                <MiniStat
                  label="Rate"
                  value={item.engagementRate != null ? item.engagementRate.toFixed(2) + "%" : "—"}
                />
                <MiniStat
                  label="Followers"
                  value={item.followers != null ? fmtK(item.followers) : "—"}
                  delta={item.followerGrowth}
                />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function MiniStat({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: "var(--fg-subtle)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        className="tnum"
        style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "baseline", gap: 5, color: "var(--fg)" }}
      >
        {value}
        {delta != null && delta !== 0 && (
          <span
            style={{
              fontSize: 10,
              color: delta > 0 ? "var(--good)" : "var(--bad)",
              fontWeight: 600,
            }}
          >
            {delta > 0 ? "+" : ""}
            {fmtK(Math.abs(delta))}
          </span>
        )}
      </div>
    </div>
  );
}
