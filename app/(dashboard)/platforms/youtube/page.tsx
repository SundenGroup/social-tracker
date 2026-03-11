"use client";

import { useState } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import KPICard from "@/components/cards/KPICard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TrendChart from "@/components/charts/TrendChart";
import EngagementPieChart from "@/components/charts/EngagementPieChart";
import TopPostsBarChart from "@/components/charts/TopPostsBarChart";
import PostGallery from "@/components/gallery/PostGallery";
import { usePlatformDashboard } from "@/hooks/usePlatformDashboard";
import SponsoredToggle from "@/components/tables/SponsoredToggle";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const CONTENT_TYPES = [
  { label: "All", value: "all" },
  { label: "Shorts", value: "short" },
  { label: "Videos", value: "video" },
  { label: "Live", value: "live" },
];

export default function YouTubeDashboardPage() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [contentType, setContentType] = useState("all");
  const { data, isLoading, error, refetch } = usePlatformDashboard("youtube", startDate, endDate, contentType);

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

  const daysDiff = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
  );
  const rangeLabel = `from content posted in last ${daysDiff} days`;

  const trendLines = [
    { dataKey: "views", name: "Views", color: "#FF0000" },
    { dataKey: "likes", name: "Likes", color: "#FF154D" },
    { dataKey: "comments", name: "Comments", color: "#121B6C" },
  ];

  const galleryItems = data.posts
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      thumbnailUrl: p.thumbnailUrl,
      title: p.title,
      metric: p.views,
      metricLabel: "views",
      contentUrl: p.contentUrl,
    }));

  return (
    <>
      <Header title="YouTube Dashboard">
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

      {/* Content Type Tabs */}
      <div className="mb-6 flex gap-2">
        {CONTENT_TYPES.map((ct) => (
          <button
            key={ct.value}
            onClick={() => setContentType(ct.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              contentType === ct.value
                ? "bg-red-600 text-white"
                : "border border-gray-300 text-clutch-grey hover:bg-gray-50"
            }`}
          >
            {ct.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <KPICard label="Total Views" value={formatCompact(data.summary.totalViews)} subtitle={rangeLabel}
          trend={data.summary.comparison?.views != null ? { value: data.summary.comparison.views, isPositive: data.summary.comparison.views >= 0 } : undefined} />
        <KPICard label="Total Likes" value={formatCompact(data.summary.totalLikes)} subtitle={rangeLabel}
          trend={data.summary.comparison?.likes != null ? { value: data.summary.comparison.likes, isPositive: data.summary.comparison.likes >= 0 } : undefined} />
        <KPICard label="Comments" value={formatCompact(data.summary.totalComments)} subtitle={rangeLabel}
          trend={data.summary.comparison?.comments != null ? { value: data.summary.comparison.comments, isPositive: data.summary.comparison.comments >= 0 } : undefined} />
        <KPICard label="Engagement Rate" value={`${data.summary.avgEngagementRate}%`} subtitle={rangeLabel}
          trend={data.summary.comparison?.engagementRate != null ? { value: data.summary.comparison.engagementRate, isPositive: data.summary.comparison.engagementRate >= 0 } : undefined} />
        <KPICard label="Total Posts" value={String(data.summary.totalPosts)} subtitle={rangeLabel}
          trend={data.summary.comparison?.posts != null ? { value: data.summary.comparison.posts, isPositive: data.summary.comparison.posts >= 0 } : undefined} />
      </div>

      {/* Account Stats */}
      {data.accountStats && data.accountStats.totalFollowers > 0 && (
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-3">
          <span className="text-xs font-medium text-clutch-grey/60">Subscribers</span>
          <span className="text-lg font-bold text-clutch-black">{formatCompact(data.accountStats.totalFollowers)}</span>
          {data.accountStats.followerGrowth !== 0 && (
            <span className={`text-xs font-medium ${data.accountStats.followerGrowth > 0 ? "text-green-600" : "text-red-500"}`}>
              {data.accountStats.followerGrowth > 0 ? "+" : ""}{formatCompact(data.accountStats.followerGrowth)} in period
            </span>
          )}
        </div>
      )}

      {/* Trend Chart */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Performance Trends</h2>
        <TrendChart data={data.trends} lines={trendLines} />
      </div>

      {/* Charts Row */}
      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-bold text-clutch-black">Engagement Breakdown</h2>
          <EngagementPieChart data={data.engagementBreakdown} />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-bold text-clutch-black">Top Videos by Views</h2>
          <TopPostsBarChart data={data.topPosts} color="#FF0000" />
        </div>
      </div>

      {/* Top Videos Gallery */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-bold text-clutch-black">Top Videos</h2>
        <PostGallery items={galleryItems} />
      </div>

      {/* Video Performance Table */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Video Performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-clutch-grey/50">
                <th className="pb-2 pr-4 font-medium">Title</th>
                <th className="pb-2 pr-1 font-medium" title="Sponsored">Sp.</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium text-right">Views</th>
                <th className="pb-2 pr-4 font-medium text-right">Likes</th>
                <th className="pb-2 pr-4 font-medium text-right">Comments</th>
                <th className="pb-2 pr-4 font-medium text-right">Eng. Rate</th>
                <th className="pb-2 font-medium text-right">Published</th>
              </tr>
            </thead>
            <tbody>
              {data.posts.slice(0, 50).map((post) => (
                <tr key={post.id} className={`border-b border-gray-50 ${post.isSponsored ? "bg-amber-50/40" : ""}`}>
                  <td className="max-w-[200px] truncate py-2 pr-4 font-medium text-clutch-black">
                    <a href={post.contentUrl} target="_blank" rel="noopener noreferrer" className="hover:text-red-600">
                      {post.title || "Untitled"}
                    </a>
                  </td>
                  <td className="py-2 pr-1">
                    <SponsoredToggle postId={post.id} isSponsored={post.isSponsored} onToggled={() => refetch()} />
                  </td>
                  <td className="py-2 pr-4 capitalize text-clutch-grey/70">{post.postType}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.views)}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.likes)}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.comments)}</td>
                  <td className="py-2 pr-4 text-right">{post.engagementRate}%</td>
                  <td className="py-2 text-right text-clutch-grey/50">
                    {new Date(post.publishedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.posts.length === 0 && (
            <p className="py-8 text-center text-sm text-clutch-grey/50">No videos found</p>
          )}
        </div>
      </div>
    </>
  );
}
