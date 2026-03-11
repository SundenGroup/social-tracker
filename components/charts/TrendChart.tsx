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
  ResponsiveContainer,
} from "recharts";

interface TrendLine {
  dataKey: string;
  name: string;
  color: string;
}

interface TrendChartProps {
  data: Record<string, unknown>[];
  lines: TrendLine[];
  height?: number;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TrendChart({ data, lines, height = 300 }: TrendChartProps) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [visibleLines, setVisibleLines] = useState<Set<string>>(
    () => new Set(lines.map((l) => l.dataKey))
  );

  function toggleLine(dataKey: string) {
    setVisibleLines((prev) => {
      const next = new Set(prev);
      if (next.has(dataKey)) {
        // Don't allow hiding all lines
        if (next.size > 1) next.delete(dataKey);
      } else {
        next.add(dataKey);
      }
      return next;
    });
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-clutch-grey/50" style={{ height }}>
        No trend data available
      </div>
    );
  }

  const chartProps = {
    data,
    margin: { top: 5, right: 20, bottom: 5, left: 0 },
  };

  const activeLines = lines.filter((l) => visibleLines.has(l.dataKey));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        {/* Metric toggles */}
        <div className="flex flex-wrap gap-1.5">
          {lines.map((line) => {
            const active = visibleLines.has(line.dataKey);
            return (
              <button
                key={line.dataKey}
                onClick={() => toggleLine(line.dataKey)}
                className="rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-all"
                style={{
                  backgroundColor: active ? line.color : "transparent",
                  color: active ? "#fff" : line.color,
                  border: `1.5px solid ${active ? line.color : line.color + "60"}`,
                  opacity: active ? 1 : 0.5,
                }}
              >
                {line.name}
              </button>
            );
          })}
        </div>

        {/* Chart type switcher */}
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
      <ResponsiveContainer width="100%" height={height}>
        {chartType === "bar" ? (
          <BarChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatDate} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
            <Tooltip formatter={(value) => formatNumber(Number(value))} labelFormatter={(label) => formatDate(String(label))} contentStyle={{ fontSize: 12 }} />
            {activeLines.map((line) => (
              <Bar
                key={line.dataKey}
                dataKey={line.dataKey}
                name={line.name}
                fill={line.color}
              />
            ))}
          </BarChart>
        ) : (
          <LineChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatDate} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
            <Tooltip formatter={(value) => formatNumber(Number(value))} labelFormatter={(label) => formatDate(String(label))} contentStyle={{ fontSize: 12 }} />
            {activeLines.map((line) => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                name={line.name}
                stroke={line.color}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
