"use client";

import { useState } from "react";
import Header from "@/components/layouts/Header";
import Link from "next/link";
import KPICard from "@/components/cards/KPICard";
import PeriodOverlayChart from "@/components/charts/PeriodOverlayChart";
import PeriodComparisonTable from "@/components/tables/PeriodComparisonTable";
import PeriodBarChart from "@/components/charts/PeriodBarChart";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { usePeriodComparison } from "@/hooks/usePeriodComparison";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

const PLATFORM_CONFIG: Record<string, { label: string; color: string; href: string }> = {
  youtube: { label: "YouTube", color: "border-l-red-500", href: "/platforms/youtube" },
  twitter: { label: "X / Twitter", color: "border-l-sky-500", href: "/platforms/twitter" },
  instagram: { label: "Instagram", color: "border-l-pink-500", href: "/platforms/instagram" },
  tiktok: { label: "TikTok", color: "border-l-gray-800", href: "/platforms/tiktok" },
};

const CONTENT_TYPES = [
  { label: "All", value: "all" },
  { label: "Video", value: "video" },
  { label: "Short-form", value: "short-form" },
  { label: "Long-form", value: "long-form" },
  { label: "Image", value: "image" },
];

export default function PeriodComparisonPage() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const lastYearEnd = new Date(now.getTime() - 365 * 86400000);
  const lastYearStart = new Date(thirtyDaysAgo.getTime() - 365 * 86400000);

  const [startA, setStartA] = useState(toDateStr(thirtyDaysAgo));
  const [endA, setEndA] = useState(toDateStr(now));
  const [startB, setStartB] = useState(toDateStr(lastYearStart));
  const [endB, setEndB] = useState(toDateStr(lastYearEnd));
  const [contentType, setContentType] = useState("all");

  const { data, isLoading, error, refetch } = usePeriodComparison(startA, endA, startB, endB, contentType);

  function applyPreviousPeriod() {
    const sA = new Date(startA);
    const eA = new Date(endA);
    const spanMs = eA.getTime() - sA.getTime();
    const newEndB = new Date(sA.getTime() - 86400000);
    const newStartB = new Date(newEndB.getTime() - spanMs);
    setStartB(toDateStr(newStartB));
    setEndB(toDateStr(newEndB));
  }

  function applySamePeriodLastYear() {
    const sA = new Date(startA);
    const eA = new Date(endA);
    sA.setFullYear(sA.getFullYear() - 1);
    eA.setFullYear(eA.getFullYear() - 1);
    setStartB(toDateStr(sA));
    setEndB(toDateStr(eA));
  }

  return (
    <>
      <Header title="Period Comparison">
        <button
          onClick={() => refetch()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-clutch-grey transition-colors hover:bg-gray-50"
        >
          Refresh
        </button>
      </Header>

      {/* Content Type Tabs */}
      <div className="mb-6 flex gap-2">
        {CONTENT_TYPES.map((ct) => (
          <button
            key={ct.value}
            onClick={() => setContentType(ct.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              contentType === ct.value
                ? "bg-clutch-black text-white"
                : "border border-gray-300 text-clutch-grey hover:bg-gray-50"
            }`}
          >
            {ct.label}
          </button>
        ))}
      </div>

      {/* Period Selection Bar */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-6">
          {/* Period A */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-clutch-black">Period A</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startA}
                onChange={(e) => setStartA(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-clutch-blue focus:outline-none"
              />
              <span className="text-xs text-clutch-grey/50">to</span>
              <input
                type="date"
                value={endA}
                onChange={(e) => setEndA(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-clutch-blue focus:outline-none"
              />
            </div>
          </div>

          {/* Period B */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-clutch-black">Period B</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startB}
                onChange={(e) => setStartB(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-clutch-blue focus:outline-none"
              />
              <span className="text-xs text-clutch-grey/50">to</span>
              <input
                type="date"
                value={endB}
                onChange={(e) => setEndB(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-clutch-blue focus:outline-none"
              />
            </div>
          </div>

          {/* Shortcuts */}
          <div className="flex gap-2">
            <button
              onClick={applyPreviousPeriod}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-clutch-grey transition-colors hover:bg-gray-50"
            >
              Previous Period
            </button>
            <button
              onClick={applySamePeriodLastYear}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-clutch-grey transition-colors hover:bg-gray-50"
            >
              Same Period Last Year
            </button>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex h-96 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}

      {data && !isLoading && (
        <>
          {/* KPI Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <KPICard
              label="Total Views"
              value={formatCompact(data.periodA.summary.totalViews)}
              subtitle={`vs ${formatCompact(data.periodB.summary.totalViews)}`}
              trend={data.changes.views !== 0 ? {
                value: Math.abs(data.changes.views),
                isPositive: data.changes.views > 0,
              } : undefined}
            />
            <KPICard
              label="Total Engagements"
              value={formatCompact(data.periodA.summary.totalEngagements)}
              subtitle={`vs ${formatCompact(data.periodB.summary.totalEngagements)}`}
              trend={data.changes.engagements !== 0 ? {
                value: Math.abs(data.changes.engagements),
                isPositive: data.changes.engagements > 0,
              } : undefined}
            />
            <KPICard
              label="Avg Eng. Rate"
              value={`${data.periodA.summary.avgEngagementRate}%`}
              subtitle={`vs ${data.periodB.summary.avgEngagementRate}%`}
              trend={data.changes.engagementRate !== 0 ? {
                value: Math.abs(data.changes.engagementRate),
                isPositive: data.changes.engagementRate > 0,
              } : undefined}
            />
            <KPICard
              label="Posts Published"
              value={String(data.periodA.summary.totalPosts)}
              subtitle={`vs ${data.periodB.summary.totalPosts}`}
              trend={data.changes.posts !== 0 ? {
                value: Math.abs(data.changes.posts),
                isPositive: data.changes.posts > 0,
              } : undefined}
            />
          </div>

          {/* Platform Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {data.periodA.platforms.map((p) => {
              const change = data.changes.platforms.find((c) => c.platform === p.platform);
              const config = PLATFORM_CONFIG[p.platform] ?? { label: p.platform, color: "border-l-gray-400", href: "#" };
              return (
                <Link key={p.platform} href={config.href}>
                  <div className={`rounded-xl border border-gray-200 border-l-4 ${config.color} bg-white p-5 transition-shadow hover:shadow-md`}>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-clutch-grey/50">
                      {config.label}
                    </p>
                    <div className="mb-1 flex gap-6">
                      <div>
                        <p className="text-lg font-bold text-clutch-black">{formatCompact(p.views)}</p>
                        <p className="text-xs text-clutch-grey/50">Views</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-clutch-black">{formatCompact(p.engagements)}</p>
                        <p className="text-xs text-clutch-grey/50">Eng.</p>
                      </div>
                    </div>
                    {change && change.views !== 0 && (
                      <p className={`text-xs font-medium ${change.views > 0 ? "text-green-600" : "text-red-500"}`}>
                        {change.views > 0 ? "\u25B2" : "\u25BC"} {change.views > 0 ? "+" : ""}{change.views}% views vs Period B
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Overlay Trend Chart */}
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-bold text-clutch-black">Views Trend Overlay</h2>
            <PeriodOverlayChart
              periodA={data.periodA.dailyTrend}
              periodB={data.periodB.dailyTrend}
              labelA={data.periodA.label}
              labelB={data.periodB.label}
            />
          </div>

          {/* Per-Platform Comparison Table */}
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-bold text-clutch-black">Per-Platform Breakdown</h2>
            <PeriodComparisonTable
              platformsA={data.periodA.platforms}
              platformsB={data.periodB.platforms}
              changes={data.changes.platforms}
            />
          </div>

          {/* Per-Platform Bar Chart */}
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-bold text-clutch-black">Platform Comparison</h2>
            <PeriodBarChart
              platformsA={data.periodA.platforms}
              platformsB={data.periodB.platforms}
              labelA={data.periodA.label}
              labelB={data.periodB.label}
            />
          </div>
        </>
      )}
    </>
  );
}
