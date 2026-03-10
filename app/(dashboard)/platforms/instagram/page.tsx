"use client";

import { useState } from "react";
import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import KPICard from "@/components/cards/KPICard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import TrendChart from "@/components/charts/TrendChart";
import EngagementPieChart from "@/components/charts/EngagementPieChart";
import PostGallery from "@/components/gallery/PostGallery";
import { usePlatformDashboard } from "@/hooks/usePlatformDashboard";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const CONTENT_TYPES = [
  { label: "All", value: "all" },
  { label: "Reels", value: "video" },
  { label: "Posts", value: "image" },
  { label: "Carousels", value: "carousel" },
];

export default function InstagramDashboardPage() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [contentType, setContentType] = useState("all");
  const [gallerySortBy, setGallerySortBy] = useState<"reach" | "engagements" | "impressions">("reach");
  const { data, isLoading, error, refetch } = usePlatformDashboard("instagram", startDate, endDate, contentType);

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
    { dataKey: "reach", name: "Reach", color: "#E4405F" },
    { dataKey: "impressions", name: "Impressions", color: "#121B6C" },
    { dataKey: "likes", name: "Engagements", color: "#FF154D" },
  ];

  const sortedPosts = [...data.posts].sort((a, b) => {
    if (gallerySortBy === "reach") return b.reach - a.reach;
    if (gallerySortBy === "engagements") return b.engagements - a.engagements;
    return b.impressions - a.impressions;
  });

  const galleryItems = sortedPosts.slice(0, 15).map((p) => ({
    id: p.id,
    thumbnailUrl: p.thumbnailUrl,
    title: p.title,
    metric: gallerySortBy === "reach" ? p.reach : gallerySortBy === "engagements" ? p.engagements : p.impressions,
    metricLabel: gallerySortBy,
    contentUrl: p.contentUrl,
  }));

  return (
    <>
      <Header title="Instagram Dashboard">
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
                ? "bg-[#E4405F] text-white"
                : "border border-gray-300 text-clutch-grey hover:bg-gray-50"
            }`}
          >
            {ct.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard label="Total Reach" value={formatCompact(data.summary.totalReach)} />
        <KPICard label="Engagement Rate" value={`${data.summary.avgEngagementRate}%`} />
        <KPICard label="Engagements" value={formatCompact(data.summary.totalLikes + data.summary.totalComments + data.summary.totalShares)} />
        <KPICard label="Total Posts" value={String(data.summary.totalPosts)} />
      </div>

      {/* Reach vs Impressions Trend */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Reach vs Impressions</h2>
        <TrendChart data={data.trends} lines={trendLines} />
      </div>

      {/* Engagement Breakdown */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Engagement Breakdown</h2>
        <EngagementPieChart data={data.engagementBreakdown} />
      </div>

      {/* Top Posts Gallery */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-clutch-black">Top Posts</h2>
          <div className="flex gap-1">
            {(["reach", "engagements", "impressions"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setGallerySortBy(s)}
                className={`rounded px-2 py-1 text-xs capitalize ${
                  gallerySortBy === s
                    ? "bg-[#E4405F] text-white"
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

      {/* Post Performance Table */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Post Performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-clutch-grey/50">
                <th className="pb-2 pr-4 font-medium">Caption</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium text-right">Reach</th>
                <th className="pb-2 pr-4 font-medium text-right">Impressions</th>
                <th className="pb-2 pr-4 font-medium text-right">Likes</th>
                <th className="pb-2 pr-4 font-medium text-right">Comments</th>
                <th className="pb-2 pr-4 font-medium text-right">Eng. Rate</th>
                <th className="pb-2 font-medium text-right">Published</th>
              </tr>
            </thead>
            <tbody>
              {data.posts.slice(0, 50).map((post) => (
                <tr key={post.id} className="border-b border-gray-50">
                  <td className="max-w-[200px] truncate py-2 pr-4 font-medium text-clutch-black">
                    <a href={post.contentUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#E4405F]">
                      {post.title || "Untitled"}
                    </a>
                  </td>
                  <td className="py-2 pr-4 capitalize text-clutch-grey/70">{post.postType}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.reach)}</td>
                  <td className="py-2 pr-4 text-right">{formatCompact(post.impressions)}</td>
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
            <p className="py-8 text-center text-sm text-clutch-grey/50">No posts found</p>
          )}
        </div>
      </div>
    </>
  );
}
