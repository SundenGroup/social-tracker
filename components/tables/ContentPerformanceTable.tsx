"use client";

import { useState } from "react";
import type { PostPerformance } from "@/types";
import { fmtK } from "@/lib/format";
import { thumbSrc, thumbProxySrc } from "@/lib/thumb-src";
import {
  PlatformGlyph,
  PLATFORM_COLOR,
  PLATFORM_SHORT,
  PostTypeIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  SearchIcon,
} from "@/components/icons/PlatformGlyph";
import PostPropsPopover from "./PostPropsPopover";
import { useProfiles } from "@/hooks/useProfiles";

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
  /** Optional slot rendered inside the toolbar, between the platform
   *  filters and the search input. Used by /posts to surface the tag
   *  pill in-row instead of as a floating strip above the table. */
  tagFilter?: React.ReactNode;
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
  tagFilter,
}: ContentPerformanceTableProps) {
  // Pull org-wide tag list so the per-post popover can offer
  // autocomplete suggestions when adding manual tags. Cheap — the
  // ProfileProvider has already fetched it once.
  const { availableTags, tagDisplayNames } = useProfiles();
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

  // Sponsored toggling now lives inside PostPropsPopover (alongside
  // the manual-tags editor). The local PATCH helper is gone —
  // `onToggleSponsored` is still called as the post-save signal so the
  // dashboard refetches, but the icon-button → fetch path moved into
  // the popover component.

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
          {tagFilter}
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
                availableTags={availableTags}
                onSaved={() => onToggleSponsored?.(p.id, p.isSponsored)}
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
  availableTags,
  onSaved,
}: {
  post: PostPerformance;
  zebra: boolean;
  lockedPlatform?: string;
  /** Org-wide tag list for the popover's autocomplete suggestions. */
  availableTags: string[];
  /** Called after the popover saves successfully — typically refetch. */
  onSaved: () => void;
}) {
  // Pull display-name overrides from the profile context so tag chips
  // can render the user's typed casing (e.g. "PAS") instead of the
  // canonical lowercase. Cheap — useProfiles is a context read.
  const { tagDisplayNames } = useProfiles();
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbSrc(post)}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              // Direct CDN URL died (expired IG/Twitter) → fall back to
              // the caching proxy, which serves a permanent copy or a
              // branded placeholder. Guard against a redirect loop.
              const img = e.target as HTMLImageElement;
              const proxied = thumbProxySrc(post.id);
              if (!img.src.endsWith(proxied)) img.src = proxied;
            }}
          />
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
        <div
          style={{
            fontSize: 10,
            color: "var(--fg-subtle)",
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>
            {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
          {/* Inline tag chips — only rule-matched auto + manual tags
              (per-account default tags are stripped server-side).
              Manual tags get the accent fill; auto-rule tags get a
              subtle outlined treatment so the visual difference is
              clear at a glance. */}
          {(post.displayTags ?? []).map((t) => {
            const isManual = (post.manualTags ?? []).includes(t);
            // Honour the user-typed casing (e.g. "PAS") when the rule
            // had a displayTag set. Falls back to the canonical
            // lowercase + CSS capitalize for legacy tags.
            const displayLabel = tagDisplayNames[t] ?? t;
            const customCased = !!tagDisplayNames[t] && tagDisplayNames[t] !== t;
            return (
              <span
                key={t}
                title={isManual ? "Manual tag" : "Auto-tagged via rule match"}
                style={{
                  padding: "1px 7px",
                  borderRadius: 10,
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: customCased ? "none" : "capitalize",
                  background: isManual
                    ? "color-mix(in srgb, var(--accent) 14%, transparent)"
                    : "transparent",
                  color: isManual ? "var(--accent)" : "var(--fg-muted)",
                  border: isManual
                    ? "1px solid color-mix(in srgb, var(--accent) 30%, transparent)"
                    : "1px solid var(--border-strong)",
                }}
              >
                {displayLabel}
              </span>
            );
          })}
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

      {/* Per-post properties popover. The trigger icon doubles as the
          sponsored indicator (yellow when isSponsored, accent when any
          manual tags). Click opens the editor for both fields at once
          rather than separate icons / forms. */}
      <div style={{ textAlign: "right" }}>
        <PostPropsPopover
          postId={post.id}
          isSponsored={post.isSponsored}
          manualTags={post.manualTags ?? []}
          autoTags={(post.tags ?? []).filter((t) => !(post.manualTags ?? []).includes(t))}
          availableTags={availableTags}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}
