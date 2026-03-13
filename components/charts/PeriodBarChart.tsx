"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface PlatformRow {
  platform: string;
  views: number;
  engagements: number;
  posts: number;
}

interface PeriodBarChartProps {
  platformsA: PlatformRow[];
  platformsB: PlatformRow[];
  labelA: string;
  labelB: string;
  height?: number;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
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

type MetricKey = "views" | "engagements" | "posts";

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: "views", label: "Views" },
  { key: "engagements", label: "Engagements" },
  { key: "posts", label: "Posts" },
];

export default function PeriodBarChart({
  platformsA,
  platformsB,
  labelA,
  labelB,
  height = 280,
}: PeriodBarChartProps) {
  const [metric, setMetric] = useState<MetricKey>("views");

  const data = platformsA.map((a) => {
    const b = platformsB.find((p) => p.platform === a.platform);
    return {
      name: platformLabel(a.platform),
      periodA: a[metric],
      periodB: b?.[metric] ?? 0,
    };
  });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-clutch-grey/60">Metric:</span>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricKey)}
          className="rounded-md border border-gray-200 px-2 py-1 text-xs text-clutch-black focus:border-clutch-blue focus:outline-none"
        >
          {METRIC_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={100}
          />
          <Tooltip
            formatter={(value, name) => [
              formatNumber(Number(value)),
              String(name) === "periodA" ? labelA : labelB,
            ]}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend
            formatter={(value: string) => (value === "periodA" ? labelA : labelB)}
            wrapperStyle={{ fontSize: 11 }}
          />
          <Bar dataKey="periodA" name="periodA" fill="#121B6C" radius={[0, 4, 4, 0]} />
          <Bar dataKey="periodB" name="periodB" fill="#999" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
