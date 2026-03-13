"use client";

import { Fragment } from "react";

interface PlatformRow {
  platform: string;
  views: number;
  engagements: number;
  engagementRate: number;
  posts: number;
}

interface PlatformChange {
  platform: string;
  views: number;
  engagements: number;
  engagementRate: number;
  posts: number;
}

interface PeriodComparisonTableProps {
  platformsA: PlatformRow[];
  platformsB: PlatformRow[];
  changes: PlatformChange[];
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function platformLabel(platform: string): string {
  switch (platform) {
    case "youtube": return "YouTube";
    case "twitter": return "X / Twitter";
    case "instagram": return "Instagram";
    case "tiktok": return "TikTok";
    default: return platform;
  }
}

function ChangeCell({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const isPositive = value > 0;
  const isZero = value === 0;
  return (
    <span
      className={`text-xs font-medium ${
        isZero ? "text-clutch-grey/50" : isPositive ? "text-green-600" : "text-red-500"
      }`}
    >
      {isPositive ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}

const METRICS = [
  { key: "views" as const, label: "Views", format: formatCompact, suffix: "%" },
  { key: "engagements" as const, label: "Engagements", format: formatCompact, suffix: "%" },
  { key: "engagementRate" as const, label: "Eng. Rate", format: (n: number) => `${n}%`, suffix: "pp" },
  { key: "posts" as const, label: "Posts", format: (n: number) => String(n), suffix: "%" },
];

export default function PeriodComparisonTable({
  platformsA,
  platformsB,
  changes,
}: PeriodComparisonTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-clutch-grey/60">
            <th className="pb-2 pr-4 font-medium">Metric</th>
            <th className="pb-2 pr-4 font-medium text-right">Period A</th>
            <th className="pb-2 pr-4 font-medium text-right">Period B</th>
            <th className="pb-2 font-medium text-right">Change</th>
          </tr>
        </thead>
        <tbody>
          {platformsA.map((rowA, i) => {
            const rowB = platformsB[i];
            const change = changes.find((c) => c.platform === rowA.platform);
            if (!rowB || !change) return null;

            return (
              <Fragment key={rowA.platform}>
                {/* Platform header row */}
                <tr className="border-t-2 border-gray-200 bg-gray-50/50">
                  <td colSpan={4} className="py-2.5 pr-4 text-xs font-bold uppercase tracking-wide text-clutch-black">
                    {platformLabel(rowA.platform)}
                  </td>
                </tr>
                {/* Metric rows */}
                {METRICS.map((metric, mi) => (
                  <tr
                    key={metric.key}
                    className={mi < METRICS.length - 1 ? "border-b border-gray-100" : ""}
                  >
                    <td className="py-2 pr-4 pl-4 text-clutch-grey">{metric.label}</td>
                    <td className="py-2 pr-4 text-right font-medium text-clutch-black">
                      {metric.format(rowA[metric.key])}
                    </td>
                    <td className="py-2 pr-4 text-right text-clutch-grey">
                      {metric.format(rowB[metric.key])}
                    </td>
                    <td className="py-2 text-right">
                      <ChangeCell value={change[metric.key]} suffix={metric.suffix} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
