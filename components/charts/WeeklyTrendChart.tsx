"use client";

import { useState } from "react";
import {
  LineChart,
  BarChart,
  Line,
  Bar,
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

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  twitter: "Twitter",
  instagram: "Instagram",
  tiktok: "TikTok",
};

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function WeeklyTrendChart({ data }: WeeklyTrendChartProps) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-clutch-grey/50">
        No trend data available
      </div>
    );
  }

  const platforms = ["youtube", "twitter", "instagram", "tiktok"].filter(
    (p) => data.some((d) => (d as unknown as Record<string, unknown>)[p] !== undefined)
  );

  const chartProps = {
    data,
    margin: { top: 5, right: 20, bottom: 5, left: 0 },
  };

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <div className="flex gap-1 rounded-md bg-gray-100 p-0.5">
          <button
            onClick={() => setChartType("bar")}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              chartType === "bar" ? "bg-white text-clutch-black shadow-sm" : "text-clutch-grey/60"
            }`}
          >
            Bar
          </button>
          <button
            onClick={() => setChartType("line")}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              chartType === "line" ? "bg-white text-clutch-black shadow-sm" : "text-clutch-grey/60"
            }`}
          >
            Line
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        {chartType === "bar" ? (
          <BarChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatDate} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
            <Tooltip formatter={(value) => formatNumber(Number(value))} labelFormatter={(label) => formatDate(String(label))} contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {platforms.map((platform) => (
              <Bar
                key={platform}
                dataKey={platform}
                fill={PLATFORM_COLORS[platform]}
                name={PLATFORM_LABELS[platform] || platform}
                stackId="views"
                radius={platforms.indexOf(platform) === platforms.length - 1 ? [2, 2, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        ) : (
          <LineChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatDate} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
            <Tooltip formatter={(value) => formatNumber(Number(value))} labelFormatter={(label) => formatDate(String(label))} contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {platforms.map((platform) => (
              <Line
                key={platform}
                type="monotone"
                dataKey={platform}
                stroke={PLATFORM_COLORS[platform]}
                strokeWidth={2}
                dot={false}
                name={PLATFORM_LABELS[platform] || platform}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
