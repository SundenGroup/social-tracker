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

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function TikTokDashboardPage() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [gallerySortBy, setGallerySortBy] = useState<"views" | "engagements" | "likes">("views");
  const { data, isLoading, error, refetch } = usePlatformDashboard("tiktok", startDate, endDate);

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
    { dataKey: "views", name: "Views", color: "#000000" },
    { dataKey: "likes", name: "Likes", color: "#FF154D" },
    { dataKey: "shares", name: "Shares", color: "#1DA1F2" },
  ];

  const sortedPosts = [...data.posts].sort((a, b) => {
    if (gallerySortBy === "views") return b.views - a.views;
    if (gallerySortBy === "engagements") return b.engagements - a.engagements;
    return b.likes - a.likes;
  });

  const galleryItems = sortedPosts.slice(0, 15).map((p) => ({
    id: p.id,
    thumbnailUrl: p.thumbnailUrl,
    title: p.title,
    metric: gallerySortBy === "views" ? p.views : gallerySortBy === "engagements" ? p.engagements : p.likes,
    metricLabel: gallerySortBy,
    contentUrl: p.contentUrl,
  }));

  return (
    <>
      <Header title="TikTok Dashboard">
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

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard label="Total Views" value={formatCompact(data.summary.totalViews)} />
        <KPICard label="Engagement Rate" value={`${data.summary.avgEngagementRate}%`} />
        <KPICard label="Engagements" value={formatCompact(data.summary.totalLikes + data.summary.totalComments + data.summary.totalShares)} />
        <KPICard label="Total Videos" value={String(data.summary.totalPosts)} />
      </div>

      {/* Views & Engagement Trend */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Views & Engagement Trends</h2>
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
          <TopPostsBarChart data={data.topPosts} color="#000000" />
        </div>
      </div>

      {/* Top Videos Gallery */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-clutch-black">Top Videos</h2>
          <div className="flex gap-1">
            {(["views", "engagements", "likes"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setGallerySortBy(s)}
                className={`rounded px-2 py-1 text-xs capitalize ${
                  gallerySortBy === s
                    ? "bg-clutch-black text-white"
                    : "text-clutch-grey/50 hover:text-clutch-grey"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
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
                <th className="pb-2 pr-4 font-medium text-right">Views</th>
                <th className="pb-2 pr-4 font-medium text-right">Likes</th>
                <th className="pb-2 pr-4 font-medium text-right">Comments</th>
                <th className="pb-2 pr-4 font-medium text-right">Shares</th>
                <th className="pb-2 pr-4 font-medium text-right">Eng. Rate</th>
                <th className="pb-2 font-medium text-right">Published</th>
              </tr>
            </thead>
            <tbody>
              {data.posts.slice(0, 50).map((post) => (
                <tr key={post.id} className="border-b border-gray-50">
                  <td className="max-w-[200px] truncate py-2 pr-4 font-medium text-clutch-black">
                    <a href={post.contentUrl} target="_blank" rel="noopener noreferrer" className="hover:text-clutch-grey">
                      {post.title || "Untitled"}
                    </a>
                  </td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.views)}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.likes)}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.comments)}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.shares)}</td>
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
