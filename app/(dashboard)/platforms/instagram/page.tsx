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
import SponsoredToggle from "@/components/tables/SponsoredToggle";

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
  const [gallerySortBy, setGallerySortBy] = useState<"views" | "engagements" | "likes">("views");
  const [sortKey, setSortKey] = useState<string>("publishedAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const pageSize = 25;
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

  const daysDiff = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
  );
  const rangeLabel = `from content posted in last ${daysDiff} days`;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
    setTablePage(0);
  };

  const tableSortedPosts = [...data.posts].sort((a, b) => {
    let aVal: number | string, bVal: number | string;
    if (sortKey === "publishedAt") {
      aVal = new Date(a.publishedAt).getTime();
      bVal = new Date(b.publishedAt).getTime();
    } else {
      aVal = (a as unknown as Record<string, number>)[sortKey];
      bVal = (b as unknown as Record<string, number>)[sortKey];
    }
    if (aVal < bVal) return sortAsc ? -1 : 1;
    if (aVal > bVal) return sortAsc ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(tableSortedPosts.length / pageSize);
  const paginatedPosts = tableSortedPosts.slice(tablePage * pageSize, (tablePage + 1) * pageSize);

  const SortHeader = ({ label, sortField, align }: { label: string; sortField: string; align?: string }) => (
    <th
      className={`cursor-pointer select-none pb-2 pr-4 font-medium hover:text-clutch-black ${align === "right" ? "text-right" : ""}`}
      onClick={() => handleSort(sortField)}
    >
      {label} {sortKey === sortField ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
    </th>
  );

  const trendLines = [
    { dataKey: "views", name: "Views", color: "#E4405F" },
    { dataKey: "likes", name: "Likes", color: "#FF154D" },
    { dataKey: "comments", name: "Comments", color: "#121B6C" },
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
        <KPICard label="Total Views" value={formatCompact(data.summary.totalViews)} subtitle={rangeLabel}
          trend={data.summary.comparison?.views != null ? { value: data.summary.comparison.views, isPositive: data.summary.comparison.views >= 0 } : undefined} />
        <KPICard label="Engagement Rate" value={`${data.summary.avgEngagementRate}%`} subtitle={rangeLabel}
          trend={data.summary.comparison?.engagementRate != null ? { value: data.summary.comparison.engagementRate, isPositive: data.summary.comparison.engagementRate >= 0 } : undefined} />
        <KPICard label="Total Likes" value={formatCompact(data.summary.totalLikes)} subtitle={rangeLabel}
          trend={data.summary.comparison?.likes != null ? { value: data.summary.comparison.likes, isPositive: data.summary.comparison.likes >= 0 } : undefined} />
        <KPICard label="Total Posts" value={String(data.summary.totalPosts)} subtitle={rangeLabel}
          trend={data.summary.comparison?.posts != null ? { value: data.summary.comparison.posts, isPositive: data.summary.comparison.posts >= 0 } : undefined} />
      </div>

      {/* Account Stats */}
      {data.accountStats && data.accountStats.totalFollowers > 0 && (
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-3">
          <span className="text-xs font-medium text-clutch-grey/60">Followers</span>
          <span className="text-lg font-bold text-clutch-black">{formatCompact(data.accountStats.totalFollowers)}</span>
          {data.accountStats.followerGrowth !== 0 && (
            <span className={`text-xs font-medium ${data.accountStats.followerGrowth > 0 ? "text-green-600" : "text-red-500"}`}>
              {data.accountStats.followerGrowth > 0 ? "+" : ""}{formatCompact(data.accountStats.followerGrowth)} in period
            </span>
          )}
        </div>
      )}

      {/* Reach vs Impressions Trend */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Views & Engagement Trend</h2>
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
            {(["views", "engagements", "likes"] as const).map((s) => (
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
                <th className="pb-2 pr-1 font-medium" title="Sponsored">Sp.</th>
                <SortHeader label="Type" sortField="postType" />
                <SortHeader label="Views" sortField="views" align="right" />
                <SortHeader label="Likes" sortField="likes" align="right" />
                <SortHeader label="Comments" sortField="comments" align="right" />
                <SortHeader label="Eng. Rate" sortField="engagementRate" align="right" />
                <SortHeader label="Published" sortField="publishedAt" align="right" />
              </tr>
            </thead>
            <tbody>
              {paginatedPosts.map((post) => (
                <tr key={post.id} className={`border-b border-gray-50 ${post.isSponsored ? "bg-amber-50/40" : ""}`}>
                  <td className="max-w-[200px] truncate py-2 pr-4 font-medium text-clutch-black">
                    <a href={post.contentUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#E4405F]">
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
            <p className="py-8 text-center text-sm text-clutch-grey/50">No posts found</p>
          )}
        </div>
        {tableSortedPosts.length > pageSize && (
          <div className="mt-3 flex items-center justify-between text-xs text-clutch-grey/50">
            <span>{tablePage * pageSize + 1}-{Math.min((tablePage + 1) * pageSize, tableSortedPosts.length)} of {tableSortedPosts.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setTablePage(tablePage - 1)} disabled={tablePage === 0} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-30">Prev</button>
              <button onClick={() => setTablePage(tablePage + 1)} disabled={tablePage >= totalPages - 1} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
