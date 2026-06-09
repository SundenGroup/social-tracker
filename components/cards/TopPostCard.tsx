"use client";

import { PlatformGlyph, PLATFORM_COLOR, PLATFORM_SHORT } from "@/components/icons/PlatformGlyph";
import { fmtK } from "@/lib/format";
import { thumbSrc, thumbProxySrc } from "@/lib/thumb-src";
import type { PostPerformance } from "@/types";

interface TopPostCardProps {
  post: PostPerformance;
  rank?: number;
  metric?: "views" | "engagements" | "rate";
  aspectRatio?: string;
  compact?: boolean;
}

/**
 * The hero card used in the Top Posts gallery and in the "Top posts" strip on
 * Overview / platform pages. Full-bleed thumbnail with overlay chips.
 */
export default function TopPostCard({
  post,
  rank,
  metric = "views",
  aspectRatio = "1 / 1",
  compact,
}: TopPostCardProps) {
  const color = PLATFORM_COLOR[post.platform] ?? "var(--fg-muted)";
  const short = PLATFORM_SHORT[post.platform] ?? post.platform.slice(0, 2).toUpperCase();
  const engagements = post.likes + post.comments + post.shares;

  const value =
    metric === "views" ? fmtK(post.views) : metric === "engagements" ? fmtK(engagements) : `${post.engagementRate}%`;
  const valueLabel = metric === "views" ? "views" : metric === "engagements" ? "engagements" : "eng. rate";

  return (
    <a
      href={post.contentUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--bg-elev)",
          transition: "transform .15s ease-out, box-shadow .15s ease-out",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            "0 8px 24px rgba(5,9,14,0.08), 0 1px 2px rgba(5,9,14,0.04)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = "";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "";
        }}
      >
        <div style={{ position: "relative", aspectRatio, background: "var(--bg-sunken)" }}>
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

          {/* platform badge */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: color,
              color: "#fff",
              padding: "3px 7px",
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.08em",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <PlatformGlyph platform={post.platform} size={11} invert />
            {short}
          </div>

          {/* rank badge */}
          {rank != null && (
            <div
              className="mono"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                background: "rgba(0,0,0,0.75)",
                backdropFilter: "blur(4px)",
                color: "#fff",
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {rank < 10 ? `#0${rank}` : `#${rank}`}
            </div>
          )}

          {/* stat overlay */}
          <div
            style={{
              position: "absolute",
              inset: "auto 0 0 0",
              padding: 12,
              background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
              color: "#fff",
            }}
          >
            <div
              className="tnum"
              style={{ fontSize: compact ? 16 : 22, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}
            >
              {value}
            </div>
            <div
              style={{
                fontSize: 9,
                opacity: 0.85,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginTop: 3,
              }}
            >
              {valueLabel} · {post.postType}
            </div>
          </div>
        </div>

        {!compact && (
          <div style={{ padding: "10px 12px 12px" }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.3,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                color: "var(--fg)",
              }}
            >
              {post.title || "Untitled post"}
            </div>
            <div
              className="mono"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 6,
                fontSize: 10,
                color: "var(--fg-subtle)",
              }}
            >
              <span>
                {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <span>·</span>
              <span>{fmtK(post.likes)} ♥</span>
              <span>·</span>
              <span>{post.engagementRate}%</span>
            </div>
          </div>
        )}
      </div>
    </a>
  );
}
