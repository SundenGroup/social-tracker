"use client";

import { useState } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
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
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const { data, isLoading, error, refetch } = useDashboard(startDate, endDate);

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
          onChange={(s, e) => {
            setStartDate(s);
            setEndDate(e);
          }}
        />
        <button
          onClick={() => refetch()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-clutch-grey transition-colors hover:bg-gray-50"
        >
          Refresh
        </button>
      </Header>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard
          label="Total Views"
          value={formatCompact(data.summary.totalViews)}
        />
        <KPICard
          label="Total Engagements"
          value={formatCompact(data.summary.totalEngagements)}
        />
        <KPICard
          label="Avg Engagement Rate"
          value={`${data.summary.avgEngagementRate}%`}
        />
        <KPICard
          label="Impressions"
          value={formatCompact(data.summary.totalImpressions)}
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
          />
        ))}
      </div>

      {/* Weekly Trend Chart */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">
          Views Trend by Platform
        </h2>
        <WeeklyTrendChart data={data.trends} />
      </div>

      {/* Content Performance Table */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-bold text-clutch-black">
          Content Performance
        </h2>
        <ContentPerformanceTable posts={data.posts} />
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
