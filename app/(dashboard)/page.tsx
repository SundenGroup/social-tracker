"use client";

import { useState } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import { useDateRange } from "@/hooks/useDateRange";
import KPICard from "@/components/cards/KPICard";
import PlatformCard from "@/components/cards/PlatformCard";
import ContentPerformanceTable from "@/components/tables/ContentPerformanceTable";
import WeeklyTrendChart from "@/components/charts/WeeklyTrendChart";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useDashboard } from "@/hooks/useDashboard";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function DashboardPage() {
  const { startDate, endDate, setDateRange } = useDateRange();
  const [contentType, setContentType] = useState("all");
  const { data, isLoading, error, refetch } = useDashboard(startDate, endDate, contentType);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (!data) return null;

  // Compute range label for KPI subtitles
  const daysDiff = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
  );
  const rangeLabel = `from content posted in last ${daysDiff} days`;

  const syncStatusColor = (status: string) => {
    switch (status) {
      case "success": return "text-green-600 bg-green-50";
      case "failed": return "text-red-600 bg-red-50";
      case "syncing": return "text-yellow-600 bg-yellow-50";
      default: return "text-gray-500 bg-gray-50";
    }
  };

  return (
    <>
      <Header title="Overview">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => setDateRange(s, e)}
        />
        <button
          onClick={() => refetch()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-clutch-grey transition-colors hover:bg-gray-50"
        >
          Refresh
        </button>
      </Header>

      {/* Content Type Tabs */}
      <div className="mb-6 flex gap-2">
        {[
          { label: "All", value: "all" },
          { label: "Video", value: "video" },
          { label: "Short-form", value: "short-form" },
          { label: "Long-form", value: "long-form" },
          { label: "Image", value: "image" },
        ].map((ct) => (
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

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard
          label="Total Views"
          value={formatCompact(data.summary.totalViews)}
          subtitle={rangeLabel}
          trend={data.summary.comparison?.views != null ? {
            value: data.summary.comparison.views,
            isPositive: data.summary.comparison.views >= 0,
          } : undefined}
        />
        {/* Combined Engagement + Rate card */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="mb-1 text-xs font-medium text-clutch-grey/60">Engagements</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-clutch-black">{formatCompact(data.summary.totalEngagements)}</p>
            <p className="text-sm font-medium text-clutch-grey/60">({data.summary.avgEngagementRate}%)</p>
          </div>
          {data.summary.comparison?.engagements != null && (
            <p className={`mt-1 text-xs font-medium ${data.summary.comparison.engagements >= 0 ? "text-green-600" : "text-red-500"}`}>
              {data.summary.comparison.engagements >= 0 ? "\u25B2 +" : "\u25BC -"}{Math.abs(data.summary.comparison.engagements)}%
              <span className="ml-1 font-normal text-clutch-grey/40">vs prev</span>
            </p>
          )}
          <p className="mt-1 text-[10px] text-clutch-grey/40">{rangeLabel}</p>
        </div>
        <KPICard
          label="Total Posts"
          value={String(data.summary.totalPosts)}
          subtitle={rangeLabel}
          trend={data.summary.comparison?.posts != null ? {
            value: data.summary.comparison.posts,
            isPositive: data.summary.comparison.posts >= 0,
          } : undefined}
        />
        <KPICard
          label="Total Followers"
          value={formatCompact(data.summary.totalFollowers)}
          trend={data.summary.totalFollowerGrowth !== 0 ? {
            value: data.summary.totalFollowerGrowth,
            isPositive: data.summary.totalFollowerGrowth > 0,
            isAbsolute: true,
          } : undefined}
        />
      </div>

      {/* Platform Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {data.platforms.map((p) => (
          <PlatformCard
            key={p.platform}
            platform={p.platform}
            views={p.views}
            engagements={p.engagements}
            topPost={p.topPost}
            followers={p.followers}
            followerGrowth={p.followerGrowth}
          />
        ))}
      </div>

      {/* Weekly Trend Chart */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">
          Views by Publish Date
        </h2>
        <WeeklyTrendChart data={data.trends} />
      </div>

      {/* Content Performance Table */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-bold text-clutch-black">
          Content Performance
        </h2>
        <ContentPerformanceTable posts={data.posts} onToggleSponsored={() => refetch()} />
      </div>

      {/* Account Health */}
      {data.accounts.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-clutch-black">
            Account Health
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {data.accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-clutch-black">
                    {account.accountName}
                  </p>
                  <p className="text-xs text-clutch-grey/50">
                    {account.lastSyncedAt
                      ? `Synced ${new Date(account.lastSyncedAt).toLocaleDateString()}`
                      : "Never synced"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${syncStatusColor(account.syncStatus)}`}
                >
                  {account.syncStatus}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
