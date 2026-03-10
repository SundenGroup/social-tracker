"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface TrendDataPoint {
  date: string;
  youtube?: number;
  twitter?: number;
  instagram?: number;
  tiktok?: number;
}

interface WeeklyTrendChartProps {
  data: TrendDataPoint[];
}

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "#FF0000",
  twitter: "#1DA1F2",
  instagram: "#E4405F",
  tiktok: "#000000",
};

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export default function WeeklyTrendChart({ data }: WeeklyTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-clutch-grey/50">
        No trend data available
      </div>
    );
  }

  // Determine which platforms have data
  const platforms = ["youtube", "twitter", "instagram", "tiktok"].filter(
    (p) => data.some((d) => (d as unknown as Record<string, unknown>)[p] !== undefined)
  );

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatNumber}
        />
        <Tooltip
          formatter={(value) => formatNumber(Number(value))}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {platforms.map((platform) => (
          <Line
            key={platform}
            type="monotone"
            dataKey={platform}
            stroke={PLATFORM_COLORS[platform]}
            strokeWidth={2}
            dot={false}
            name={platform.charAt(0).toUpperCase() + platform.slice(1)}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
