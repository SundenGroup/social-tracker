"use client";

import type { AskBlock, AskHydratedPost } from "@/types/ask";
import { PlatformGlyph, PLATFORM_COLOR } from "@/components/icons/PlatformGlyph";
import { thumbSrc, thumbProxySrc } from "@/lib/thumb-src";
import { fmtK } from "@/lib/format";

/** contentUrl comes from scraped data — only ever link http(s). */
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);

/** Renders one hydrated Ask answer block with the house design tokens. */
export default function AskBlockRenderer({ block }: { block: AskBlock }) {
  switch (block.type) {
    case "text":
      return (
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--fg)", margin: 0, whiteSpace: "pre-wrap" }}>
          {block.text}
        </p>
      );
    case "note":
      return (
        <p style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--fg-subtle)", margin: 0, fontStyle: "italic" }}>
          {block.text}
        </p>
      );
    case "kpi":
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(130px, 1fr))`, gap: 10 }}>
          {block.items.map((item, i) => (
            <div key={i} style={{ background: "var(--bg-sunken)", borderRadius: 10, padding: "12px 14px" }}>
              <div className="tnum" style={{ fontSize: 20, fontWeight: 700, color: "var(--fg)", lineHeight: 1.1 }}>
                {item.value}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--fg-muted)", marginTop: 4 }}>{item.label}</div>
              {item.sub && <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 1 }}>{item.sub}</div>}
            </div>
          ))}
        </div>
      );
    case "table":
      return (
        <div>
          {block.title && <BlockTitle>{block.title}</BlockTitle>}
          <div className="hscroll">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--fg-subtle)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {block.columns.map((c, i) => (
                    <th key={i} style={{ padding: "0 12px 6px 0", fontWeight: 700, textAlign: i === 0 ? "left" : "right" }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri} style={{ borderTop: "1px solid var(--border)" }}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={ci === 0 ? undefined : "tnum"}
                        style={{
                          padding: "7px 12px 7px 0",
                          color: ci === 0 ? "var(--fg)" : "var(--fg-muted)",
                          fontWeight: ci === 0 ? 600 : 500,
                          textAlign: ci === 0 ? "left" : "right",
                          maxWidth: ci === 0 ? 320 : undefined,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case "posts":
      return (
        <div>
          {block.title && <BlockTitle>{block.title}</BlockTitle>}
          {block.display === "cards" ? <PostsCards posts={block.posts} /> : <PostsTable posts={block.posts} />}
        </div>
      );
    default:
      return null;
  }
}

function BlockTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function PostThumb({ post, size }: { post: AskHydratedPost; size?: number }) {
  return (
    <span
      style={{
        width: size ?? "100%",
        height: size ?? "100%",
        borderRadius: size ? 6 : 0,
        overflow: "hidden",
        background: "var(--bg-sunken)",
        flexShrink: 0,
        display: "block",
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
          const img = e.target as HTMLImageElement;
          const proxied = thumbProxySrc(post.id);
          if (!img.src.endsWith(proxied)) img.src = proxied;
        }}
      />
    </span>
  );
}

function PostsTable({ posts }: { posts: AskHydratedPost[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {posts.map((p, i) => (
        <a
          key={p.id}
          href={safeHref(p.contentUrl)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "grid",
            gridTemplateColumns: "18px 34px 1fr 74px 74px",
            gap: 10,
            alignItems: "center",
            padding: "6px 8px",
            borderRadius: 8,
            textDecoration: "none",
            color: "inherit",
            background: "var(--bg-sunken)",
          }}
        >
          <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-subtle)" }}>{i + 1}</span>
          <PostThumb post={p} size={34} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.title}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: PLATFORM_COLOR[p.platform] ?? "var(--fg-subtle)", marginTop: 2 }}>
              <PlatformGlyph platform={p.platform} size={10} />
              <span style={{ color: "var(--fg-subtle)" }}>
                {new Date(p.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </span>
          </span>
          <span style={{ textAlign: "right" }}>
            <span className="tnum" style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--fg)" }}>{fmtK(p.views)}</span>
            <span style={{ fontSize: 9, color: "var(--fg-subtle)" }}>views</span>
          </span>
          <span style={{ textAlign: "right" }}>
            <span className="tnum" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--fg-muted)" }}>
              {fmtK(p.likes + p.comments + p.shares)}
            </span>
            <span style={{ fontSize: 9, color: "var(--fg-subtle)" }}>eng.</span>
          </span>
        </a>
      ))}
    </div>
  );
}

function PostsCards({ posts }: { posts: AskHydratedPost[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
      {posts.map((p) => (
        <a
          key={p.id}
          href={safeHref(p.contentUrl)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none", color: "inherit", background: "var(--bg-sunken)", borderRadius: 10, overflow: "hidden" }}
        >
          <div style={{ aspectRatio: "4 / 3" }}>
            <PostThumb post={p} />
          </div>
          <div style={{ padding: "8px 10px 10px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.title}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
              <span style={{ color: PLATFORM_COLOR[p.platform] ?? "var(--fg-subtle)", display: "flex" }}>
                <PlatformGlyph platform={p.platform} size={11} />
              </span>
              <span className="tnum" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--fg)" }}>{fmtK(p.views)}</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
