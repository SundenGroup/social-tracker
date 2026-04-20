"use client";

import { fmtK } from "@/lib/format";

export interface CadenceCell {
  count: number;
  /** Median views (or equivalent quality score) for posts landed in this cell */
  perf?: number;
}

interface CadenceHeatmapProps {
  /**
   * 7 × 24 grid. Row 0 = Monday. If you want to compute this from posts,
   * use the helper below.
   */
  grid: CadenceCell[][];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Day-of-week × hour-of-day heatmap. Intensity = post count.
 * Hover shows count + performance.
 */
export default function CadenceHeatmap({ grid }: CadenceHeatmapProps) {
  const max = Math.max(...grid.flat().map((c) => c.count), 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Hour scale (labels every 3 hours) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "36px repeat(24, 1fr)",
          gap: 2,
          alignItems: "center",
        }}
      >
        <div />
        {hours.map((h) => (
          <div
            key={h}
            className="mono"
            style={{ fontSize: 9, color: "var(--fg-subtle)", textAlign: "center" }}
          >
            {h % 3 === 0 ? (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`) : ""}
          </div>
        ))}
      </div>

      {grid.map((row, di) => (
        <div
          key={di}
          style={{
            display: "grid",
            gridTemplateColumns: "36px repeat(24, 1fr)",
            gap: 2,
            alignItems: "center",
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--fg-muted)",
              textAlign: "right",
              paddingRight: 4,
            }}
          >
            {DAYS[di]}
          </div>
          {row.map((cell, hi) => {
            const intensity = cell.count / max;
            const bg =
              cell.count === 0
                ? "var(--bg-sunken)"
                : `color-mix(in srgb, var(--accent) ${intensity * 85 + 10}%, transparent)`;
            const tooltip = `${DAYS[di]} ${hi}:00 · ${cell.count} post${cell.count === 1 ? "" : "s"}${
              cell.perf ? ` · ${fmtK(cell.perf)} views` : ""
            }`;
            return (
              <div
                key={hi}
                title={tooltip}
                style={{
                  height: 22,
                  background: bg,
                  borderRadius: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  color: intensity > 0.6 ? "#fff" : "var(--fg-subtle)",
                  fontFamily: "'JetBrains Mono', monospace",
                  cursor: cell.count > 0 ? "pointer" : "default",
                }}
              >
                {cell.count || ""}
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 8,
          fontSize: 10,
          color: "var(--fg-subtle)",
        }}
      >
        <span>Fewer posts</span>
        {[0.1, 0.3, 0.5, 0.7, 0.9, 1].map((i) => (
          <div
            key={i}
            style={{
              width: 14,
              height: 10,
              borderRadius: 2,
              background: `color-mix(in srgb, var(--accent) ${i * 85 + 10}%, transparent)`,
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

/**
 * Build a cadence grid from a list of posts. Weekday index 0 = Monday.
 * The `perf` aggregate is the median of each cell's view counts.
 */
export function buildCadenceGrid(
  posts: Array<{ publishedAt: string | Date; views?: number }>
): CadenceCell[][] {
  const grid: CadenceCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ count: 0, perf: 0 }))
  );
  const viewsByCell: number[][][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => [])
  );

  for (const p of posts) {
    const d = p.publishedAt instanceof Date ? p.publishedAt : new Date(p.publishedAt);
    if (Number.isNaN(d.getTime())) continue;
    // JS getDay: 0 Sun … 6 Sat → convert to Mon-first
    const weekday = (d.getDay() + 6) % 7;
    const hour = d.getHours();
    grid[weekday][hour].count += 1;
    if (typeof p.views === "number") viewsByCell[weekday][hour].push(p.views);
  }

  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const arr = viewsByCell[d][h].sort((a, b) => a - b);
      if (arr.length > 0) {
        grid[d][h].perf = arr[Math.floor(arr.length / 2)];
      }
    }
  }
  return grid;
}
