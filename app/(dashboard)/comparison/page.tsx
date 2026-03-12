"use client";

import { useState } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import KPICard from "@/components/cards/KPICard";
import PlatformHealthCard from "@/components/cards/PlatformHealthCard";
import PlatformComparisonTable from "@/components/tables/PlatformComparisonTable";
import TrendChart from "@/components/charts/TrendChart";
import EngagementPieChart from "@/components/charts/EngagementPieChart";
import TopPostsBarChart from "@/components/charts/TopPostsBarChart";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useComparison } from "@/hooks/useComparison";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const TREND_LINES = [
  { dataKey: "youtube", name: "YouTube", color: "#FF0000" },
  { dataKey: "twitter", name: "Twitter", color: "#1DA1F2" },
  { dataKey: "instagram", name: "Instagram", color: "#E4405F" },
  { dataKey: "tiktok", name: "TikTok", color: "#000000" },
];

export default function ComparisonPage() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const { data, isLoading, error, refetch } = useComparison(startDate, endDate);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>;
  }

  if (!data) return null;

  // Compute summary KPIs
  const totalReach = data.platforms.reduce(
    (s, p) => s + (p.views || p.impressions || p.reach),
    0
  );
  const totalEngagements = data.platforms.reduce((s, p) => s + p.engagements, 0);
  const totalFollowers = data.platforms.reduce((s, p) => s + p.followers, 0);
  const totalFollowerGrowth = data.platforms.reduce((s, p) => s + p.followerGrowth, 0);
  const totalPosts = data.platforms.reduce((s, p) => s + p.totalPosts, 0);
  const activePlatforms = data.platforms.filter((p) => p.totalPosts > 0);
  const avgEngRate =
    activePlatforms.length > 0
      ? Number(
          (activePlatforms.reduce((s, p) => s + p.engagementRate, 0) / activePlatforms.length).toFixed(2)
        )
      : 0;

  return (
    <>
      <Header title="Cross-Platform Comparison">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        />
        <button
          onClick={() => refetch()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-clutch-grey transition-colors hover:bg-gray-50"
        >
          Refresh
        </button>
      </Header>

      {/* Summary KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <KPICard label="Total Reach" value={formatCompact(totalReach)} />
        <KPICard label="Engagements" value={formatCompact(totalEngagements)} />
        <KPICard label="Avg Eng. Rate" value={`${avgEngRate}%`} />
        <KPICard label="Total Followers" value={formatCompact(totalFollowers)}
          trend={totalFollowerGrowth !== 0 ? {
            value: totalFollowerGrowth,
            isPositive: totalFollowerGrowth > 0,
            isAbsolute: true,
          } : undefined}
        />
        <KPICard label="Posts Published" value={String(totalPosts)} />
      </div>

      {/* Platform Health Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {data.platforms.map((p) => (
          <PlatformHealthCard
            key={p.platform}
            platform={p.platform}
            engagements={p.engagements}
            engagementRate={p.engagementRate}
            followers={p.followers}
            followerGrowth={p.followerGrowth}
            totalPosts={p.totalPosts}
          />
        ))}
      </div>

      {/* Comparison Table */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Platform Comparison</h2>
        <PlatformComparisonTable platforms={data.platforms} />
      </div>

      {/* Views/Impressions Trend */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">
          Views / Impressions Trend
        </h2>
        <TrendChart data={data.trends} lines={TREND_LINES} />
      </div>

      {/* Charts Row */}
      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-bold text-clutch-black">
            Engagement Distribution
          </h2>
          <EngagementPieChart data={data.engagementDistribution} />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-bold text-clutch-black">
            Content Volume by Platform
          </h2>
          <TopPostsBarChart data={data.contentVolume} color="#121B6C" />
        </div>
      </div>
    </>
  );
}
