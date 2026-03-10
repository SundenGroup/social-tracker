"use client";

import { useState } from "react";
import type { PostPerformance } from "@/types";

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  twitter: "X / Twitter",
  instagram: "Instagram",
  tiktok: "TikTok",
};

type SortKey = "views" | "engagementRate" | "publishedAt" | "likes";

interface ContentPerformanceTableProps {
  posts: PostPerformance[];
  pageSize?: number;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ContentPerformanceTable({
  posts,
  pageSize = 20,
}: ContentPerformanceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("publishedAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
    setPage(0);
  }

  const sorted = [...posts].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "publishedAt") {
      cmp =
        new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
    } else {
      cmp = (a[sortKey] as number) - (b[sortKey] as number);
    }
    return sortAsc ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " \u2191" : " \u2193") : "";

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-clutch-grey/50">
        No posts to display
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-clutch-grey/60">
                Platform
              </th>
              <th className="px-4 py-3 font-medium text-clutch-grey/60">
                Title
              </th>
              <th className="px-4 py-3 font-medium text-clutch-grey/60">
                Type
              </th>
              <th
                className="cursor-pointer px-4 py-3 font-medium text-clutch-grey/60 hover:text-clutch-black"
                onClick={() => handleSort("views")}
              >
                Views{sortIndicator("views")}
              </th>
              <th
                className="cursor-pointer px-4 py-3 font-medium text-clutch-grey/60 hover:text-clutch-black"
                onClick={() => handleSort("engagementRate")}
              >
                Eng. Rate{sortIndicator("engagementRate")}
              </th>
              <th
                className="cursor-pointer px-4 py-3 font-medium text-clutch-grey/60 hover:text-clutch-black"
                onClick={() => handleSort("publishedAt")}
              >
                Date{sortIndicator("publishedAt")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paged.map((post) => (
              <tr key={post.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 text-xs font-medium">
                  {PLATFORM_LABELS[post.platform] ?? post.platform}
                </td>
                <td className="max-w-xs truncate px-4 py-3">
                  <a
                    href={post.contentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-clutch-blue hover:underline"
                  >
                    {post.title || "Untitled"}
                  </a>
                </td>
                <td className="px-4 py-3 text-xs capitalize">{post.postType}</td>
                <td className="px-4 py-3 font-medium">
                  {formatCompact(post.views)}
                </td>
                <td className="px-4 py-3">{post.engagementRate}%</td>
                <td className="px-4 py-3 text-clutch-grey/60">
                  {new Date(post.publishedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <p className="text-xs text-clutch-grey/50">
            {page * pageSize + 1}-
            {Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded px-2 py-1 text-xs font-medium text-clutch-grey hover:bg-gray-100 disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded px-2 py-1 text-xs font-medium text-clutch-grey hover:bg-gray-100 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
