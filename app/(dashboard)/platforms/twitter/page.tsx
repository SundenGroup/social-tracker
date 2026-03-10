"use client";

import { useState } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import KPICard from "@/components/cards/KPICard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TrendChart from "@/components/charts/TrendChart";
import EngagementPieChart from "@/components/charts/EngagementPieChart";
import TopPostsBarChart from "@/components/charts/TopPostsBarChart";
import { usePlatformDashboard } from "@/hooks/usePlatformDashboard";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function TwitterDashboardPage() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [contentFilter, setContentFilter] = useState("all");
  const { data, isLoading, error, refetch } = usePlatformDashboard("twitter", startDate, endDate, contentFilter === "video_only" ? "video" : undefined);

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

  const trendLines = [
    { dataKey: "views", name: "Views", color: "#1DA1F2" },
    { dataKey: "impressions", name: "Impressions", color: "#121B6C" },
    { dataKey: "likes", name: "Engagements", color: "#FF154D" },
  ];

  return (
    <>
      <Header title="Twitter Dashboard">
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

      {/* Content Filter Toggle */}
      <div className="mb-6 flex gap-2">
        {[
          { label: "All Content", value: "all" },
          { label: "Video Only", value: "video_only" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setContentFilter(f.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              contentFilter === f.value
                ? "bg-[#1DA1F2] text-white"
                : "border border-gray-300 text-clutch-grey hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <KPICard label="Total Views" value={formatCompact(data.summary.totalViews)} />
        <KPICard label="Impressions" value={formatCompact(data.summary.totalImpressions)} />
        <KPICard label="Engagement Rate" value={`${data.summary.avgEngagementRate}%`} />
        <KPICard label="Engagements" value={formatCompact(data.summary.totalLikes + data.summary.totalComments + data.summary.totalShares)} />
        <KPICard label="Total Posts" value={String(data.summary.totalPosts)} />
      </div>

      {/* Trend Chart */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Views & Impressions Trend</h2>
        <TrendChart data={data.trends} lines={trendLines} />
      </div>

      {/* Charts Row */}
      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-bold text-clutch-black">Engagement Breakdown</h2>
          <EngagementPieChart data={data.engagementBreakdown} />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-bold text-clutch-black">Top Tweets by Views</h2>
          <TopPostsBarChart data={data.topPosts} color="#1DA1F2" />
        </div>
      </div>

      {/* Tweet Performance Table */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Tweet Performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-clutch-grey/50">
                <th className="pb-2 pr-4 font-medium">Tweet</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium text-right">Views</th>
                <th className="pb-2 pr-4 font-medium text-right">Impressions</th>
                <th className="pb-2 pr-4 font-medium text-right">Likes</th>
                <th className="pb-2 pr-4 font-medium text-right">Retweets</th>
                <th className="pb-2 pr-4 font-medium text-right">Replies</th>
                <th className="pb-2 font-medium text-right">Published</th>
              </tr>
            </thead>
            <tbody>
              {data.posts.slice(0, 50).map((post) => (
                <tr key={post.id} className="border-b border-gray-50">
                  <td className="max-w-[250px] truncate py-2 pr-4 font-medium text-clutch-black">
                    <a href={post.contentUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#1DA1F2]">
                      {post.title || "Untitled"}
                    </a>
                  </td>
                  <td className="py-2 pr-4 capitalize text-clutch-grey/70">{post.postType}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.views)}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.impressions)}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.likes)}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.shares)}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.comments)}</td>
                  <td className="py-2 text-right text-clutch-grey/50">
                    {new Date(post.publishedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.posts.length === 0 && (
            <p className="py-8 text-center text-sm text-clutch-grey/50">No tweets found</p>
          )}
        </div>
      </div>
    </>
  );
}
