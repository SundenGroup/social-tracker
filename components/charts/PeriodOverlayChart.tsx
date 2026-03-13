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

interface DayPoint {
  day: number;
  views: number;
}

interface PeriodOverlayChartProps {
  periodA: DayPoint[];
  periodB: DayPoint[];
  labelA: string;
  labelB: string;
  height?: number;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export default function PeriodOverlayChart({
  periodA,
  periodB,
  labelA,
  labelB,
  height = 300,
}: PeriodOverlayChartProps) {
  // Merge both trends into a single dataset keyed by day offset
  const maxDays = Math.max(periodA.length, periodB.length);
  const merged = [];
  for (let i = 0; i < maxDays; i++) {
    merged.push({
      day: `Day ${i + 1}`,
      periodA: periodA[i]?.views ?? 0,
      periodB: periodB[i]?.views ?? 0,
    });
  }

  if (merged.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-clutch-grey/50" style={{ height }}>
        No trend data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={merged} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval={Math.max(0, Math.floor(merged.length / 10) - 1)}
        />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
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
        <Line
          type="monotone"
          dataKey="periodA"
          name="periodA"
          stroke="#121B6C"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="periodB"
          name="periodB"
          stroke="#999"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
