"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TopPostItem {
  name: string;
  value: number;
}

interface TopPostsBarChartProps {
  data: TopPostItem[];
  color?: string;
  height?: number;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export default function TopPostsBarChart({
  data,
  color = "#FF154D",
  height = 280,
}: TopPostsBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-clutch-grey/50" style={{ height }}>
        No data available
      </div>
    );
  }

  return (
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
          width={120}
        />
        <Tooltip formatter={(value) => formatNumber(Number(value))} contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
