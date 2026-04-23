"use client";

import { useState } from "react";
import type { PostPerformance } from "@/types";
import { fmtK } from "@/lib/format";
import {
  PlatformGlyph,
  PLATFORM_COLOR,
  PLATFORM_SHORT,
  PostTypeIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  SearchIcon,
} from "@/components/icons/PlatformGlyph";

type SortKey = "views" | "engagementRate" | "publishedAt" | "likes" | "comments";

interface ContentPerformanceTableProps {
  posts: PostPerformance[];
  pageSize?: number;
  onToggleSponsored?: (postId: string, isSponsored: boolean) => void;
  /** Optional external platform filter (e.g. when embedded on a platform page) */
  lockedPlatform?: string;
  /** Hide the search + filter bar (already provided by the page) */
  hideToolbar?: boolean;
  /** Max rows to show. Defaults to all. */
  maxRows?: number;
}

const PLATFORM_FILTERS = [
  { key: "all", label: "All posts" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "twitter", label: "X / Twitter" },
  { key: "instagram", label: "Instagram" },
];

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return iso;
  }
}

export default function ContentPerformanceTable({
  posts,
  pageSize = 20,
  onToggleSponsored,
  lockedPlatform,
  hideToolbar,
  maxRows,
}: ContentPerformanceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("publishedAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState(lockedPlatform ?? "all");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
    setPage(0);
  }

  async function handleToggleSponsored(postId: string, current: boolean) {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSponsored: !current }),
      });
      if (res.ok && onToggleSponsored) onToggleSponsored(postId, !current);
    } catch {
      // silently ignore
    }
  }

  const filtered = posts.filter((p) => {
    if (lockedPlatform && p.platform !== lockedPlatform) return false;
    if (!lockedPlatform && platformFilter !== "all" && p.platform !== platformFilter) return false;
    if (search && !(p.title ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "publishedAt") {
      cmp = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
    } else {
      cmp = (a[sortKey] as number) - (b[sortKey] as number);
    }
    return sortAsc ? cmp : -cmp;
  });

  const rowCount = maxRows ? Math.min(maxRows, sorted.length) : sorted.length;
  const totalPages = maxRows ? 1 : Math.ceil(rowCount / pageSize);
  const start = maxRows ? 0 : page * pageSize;
  const end = maxRows ? rowCount : Math.min((page + 1) * pageSize, rowCount);
  const paged = sorted.slice(start, end);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!hideToolbar && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {!lockedPlatform && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PLATFORM_FILTERS.map((f) => {
                const color = f.key === "all" ? null : PLATFORM_COLOR[f.key];
                const active = platformFilter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => {
                      setPlatformFilter(f.key);
                      setPage(0);
                    }}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: active ? "var(--fg)" : "var(--bg-elev)",
                      color: active ? "var(--bg-elev)" : "var(--fg-muted)",
                      fontSize: 12,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {color && (
                      <span style={{ color: active ? "inherit" : color }}>
                        <PlatformGlyph platform={f.key} size={12} />
                      </span>
                    )}
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "6px 10px",
              minWidth: 220,
              color: "var(--fg-muted)",
            }}
          >
            <SearchIcon />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search captions..."
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: 12,
                color: "var(--fg)",
                flex: 1,
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>
      )}

      <div
        className="hscroll"
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {posts.length === 0 || sorted.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
            No posts in this period
          </div>
        ) : (
          // Inner min-width keeps the 8 columns readable on mobile — users
          // swipe horizontally through the table rather than the columns
          // collapsing into each other.
          <div style={{ minWidth: 780 }}>
            {/* Header row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr 88px 88px 90px 90px 90px 100px 40px",
                padding: "12px 16px",
                background: "var(--bg-sunken)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--fg-subtle)",
                borderBottom: "1px solid var(--border)",
                alignItems: "center",
              }}
            >
              <div />
              <div>Post</div>
              {!lockedPlatform ? <div>Platform</div> : <div />}
              <div>Type</div>
              <SortHead label="Views" k="views" sortKey={sortKey} sortAsc={sortAsc} onClick={toggleSort} align="right" />
              <SortHead label="Likes" k="likes" sortKey={sortKey} sortAsc={sortAsc} onClick={toggleSort} align="right" />
              <SortHead
                label="Eng. rate"
                k="engagementRate"
                sortKey={sortKey}
                sortAsc={sortAsc}
                onClick={toggleSort}
                align="right"
              />
              <SortHead
                label="Published"
                k="publishedAt"
                sortKey={sortKey}
                sortAsc={sortAsc}
                onClick={toggleSort}
                align="right"
              />
              <div />
            </div>

            {paged.map((p, i) => (
              <PostRow
                key={p.id}
                post={p}
                zebra={i % 2 === 1}
                lockedPlatform={lockedPlatform}
                onToggleSponsored={() => handleToggleSponsored(p.id, p.isSponsored)}
              />
            ))}

            {totalPages > 1 && (
              <div
                style={{
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTop: "1px solid var(--border)",
                  fontSize: 11,
                  color: "var(--fg-muted)",
                }}
              >
                <span>
                  Showing {start + 1}–{end} of {rowCount}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={pagerBtn(false)} onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
                    Prev
                  </button>
                  <button style={pagerBtn(true)}>{page + 1}</button>
                  <button
                    style={pagerBtn(false)}
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function pagerBtn(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: active ? "var(--fg)" : "var(--bg-elev)",
    color: active ? "var(--bg-elev)" : "var(--fg-muted)",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function SortHead({
  label,
  k,
  sortKey,
  sortAsc,
  onClick,
  align,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortAsc: boolean;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <button
      onClick={() => onClick(k)}
      style={{
        textAlign: align ?? "left",
        padding: 0,
        border: "none",
        background: "transparent",
        color: active ? "var(--fg)" : "var(--fg-subtle)",
        fontWeight: 700,
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        width: "100%",
      }}
    >
      {label}
      {active && (sortAsc ? <ArrowUpIcon size={10} /> : <ArrowDownIcon size={10} />)}
    </button>
  );
}

function PostRow({
  post,
  zebra,
  lockedPlatform,
  onToggleSponsored,
}: {
  post: PostPerformance;
  zebra: boolean;
  lockedPlatform?: string;
  onToggleSponsored: () => void;
}) {
  const color = PLATFORM_COLOR[post.platform] ?? "var(--fg-muted)";
  const short = PLATFORM_SHORT[post.platform] ?? post.platform.slice(0, 2).toUpperCase();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "56px 1fr 88px 88px 90px 90px 90px 100px 40px",
        padding: "10px 16px",
        alignItems: "center",
        background: zebra ? "color-mix(in srgb, var(--fg) 2%, transparent)" : "transparent",
        borderBottom: "1px solid var(--border)",
        fontSize: 12,
      }}
    >
      {/* thumb */}
      <div>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 6,
            overflow: "hidden",
            background: "var(--bg-sunken)",
            position: "relative",
          }}
        >
          {post.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.thumbnailUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
        </div>
      </div>

      {/* title + link */}
      <div style={{ minWidth: 0, paddingRight: 12 }}>
        <a
          href={post.contentUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontWeight: 600,
            color: "var(--fg)",
            textDecoration: "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
          }}
        >
          {post.title || "Untitled post"}
        </a>
        <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 2 }}>
          {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
      </div>

      {/* platform */}
      {!lockedPlatform ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color }}>
            <PlatformGlyph platform={post.platform} size={14} />
          </span>
          <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{short}</span>
        </div>
      ) : (
        <div />
      )}

      {/* type */}
      <div
        style={{
          fontSize: 11,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--fg-muted)",
          textTransform: "capitalize",
        }}
      >
        <PostTypeIcon type={post.postType} />
        {post.postType}
      </div>

      {/* metrics */}
      <div className="mono tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--fg)" }}>
        {fmtK(post.views)}
      </div>
      <div className="mono tnum" style={{ textAlign: "right", color: "var(--fg-muted)" }}>
        {fmtK(post.likes)}
      </div>
      <div
        className="mono tnum"
        style={{
          textAlign: "right",
          color: post.engagementRate > 2 ? "var(--good)" : "var(--fg-muted)",
          fontWeight: post.engagementRate > 2 ? 600 : 400,
        }}
      >
        {post.engagementRate}%
      </div>
      <div className="mono tnum" style={{ textAlign: "right", color: "var(--fg-subtle)", fontSize: 11 }}>
        {formatDate(post.publishedAt)}
      </div>

      {/* sponsored */}
      <div style={{ textAlign: "right" }}>
        <button
          onClick={onToggleSponsored}
          title={post.isSponsored ? "Sponsored (click to remove)" : "Mark as sponsored"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 2,
            background: "transparent",
            border: "none",
            color: post.isSponsored ? "#E09B00" : "var(--fg-subtle)",
            opacity: post.isSponsored ? 1 : 0.4,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={post.isSponsored ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
