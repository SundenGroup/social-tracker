"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PlatformGlyph, PLATFORM_COLOR, PLATFORM_LABEL } from "@/components/icons/PlatformGlyph";
import { thumbProxySrc } from "@/lib/thumb-src";
import { fmtK } from "@/lib/format";

interface ShareData {
  title: string;
  organization: string;
  scope: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  summary: { posts: number; views: number; engagements: number; engagementRate: number };
  platforms: Array<{ platform: string; posts: number; views: number; engagements: number }>;
  topPosts: Array<{
    id: string;
    platform: string;
    title: string;
    contentUrl: string;
    thumbnailUrl: string | null;
    publishedAt: string;
    views: number;
    engagements: number;
  }>;
}

/**
 * Public, read-only report page — reachable with the link token alone.
 * "Download PDF" uses the browser's print pipeline (print stylesheet
 * below), which produces a clean paginated PDF with zero server cost.
 */
export default function SharedReportPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.token) return;
    fetch(`/api/share/${params.token}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed to load report");
        setData(j.data);
      })
      .catch((e) => setError(e.message));
  }, [params?.token]);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--fg-muted)", fontSize: 14 }}>
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--fg-subtle)", fontSize: 13 }}>
        Loading report…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .share-card { break-inside: avoid; }
        }
      `}</style>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 28px 64px" }}>
        {/* Masthead */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
              {data.organization} · Social report
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--fg)", letterSpacing: "-0.02em", margin: "6px 0 4px" }}>
              {data.title}
            </h1>
            <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              {data.scope} · {data.startDate} → {data.endDate}
            </div>
          </div>
          <button
            className="no-print"
            onClick={() => window.print()}
            style={{
              padding: "9px 16px",
              borderRadius: 9,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Download PDF
          </button>
        </div>

        {/* KPIs */}
        <div className="share-card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Posts published", value: data.summary.posts.toLocaleString() },
            { label: "Total views", value: fmtK(data.summary.views) },
            { label: "Engagements", value: fmtK(data.summary.engagements) },
            { label: "Engagement rate", value: `${data.summary.engagementRate}%` },
          ].map((kpi) => (
            <div key={kpi.label} style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px" }}>
              <div className="tnum" style={{ fontSize: 26, fontWeight: 800, color: "var(--fg)", letterSpacing: "-0.02em" }}>{kpi.value}</div>
              <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 4 }}>{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Per-platform */}
        <div className="share-card" style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)", marginBottom: 12 }}>By platform</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--fg-subtle)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
                <th style={{ paddingBottom: 8, fontWeight: 700 }}>Platform</th>
                <th style={{ paddingBottom: 8, fontWeight: 700, textAlign: "right" }}>Posts</th>
                <th style={{ paddingBottom: 8, fontWeight: 700, textAlign: "right" }}>Views</th>
                <th style={{ paddingBottom: 8, fontWeight: 700, textAlign: "right" }}>Engagements</th>
              </tr>
            </thead>
            <tbody>
              {data.platforms.map((p) => (
                <tr key={p.platform} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "9px 0", fontWeight: 600, color: "var(--fg)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <span style={{ color: PLATFORM_COLOR[p.platform] ?? "var(--fg-muted)", display: "flex" }}>
                        <PlatformGlyph platform={p.platform} size={13} />
                      </span>
                      {PLATFORM_LABEL[p.platform] ?? p.platform}
                    </span>
                  </td>
                  <td className="tnum" style={{ textAlign: "right", color: "var(--fg-muted)" }}>{p.posts.toLocaleString()}</td>
                  <td className="tnum" style={{ textAlign: "right", color: "var(--fg)", fontWeight: 600 }}>{fmtK(p.views)}</td>
                  <td className="tnum" style={{ textAlign: "right", color: "var(--fg-muted)" }}>{fmtK(p.engagements)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top posts */}
        <div className="share-card" style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)", marginBottom: 12 }}>Top posts by views</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.topPosts.map((p, i) => (
              <a
                key={p.id}
                href={/^https?:\/\//i.test(p.contentUrl) ? p.contentUrl : undefined}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 40px 1fr 80px 80px",
                  gap: 10,
                  alignItems: "center",
                  padding: "7px 8px",
                  borderRadius: 8,
                  background: "var(--bg-sunken)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-subtle)" }}>{i + 1}</span>
                <span style={{ width: 40, height: 40, borderRadius: 6, overflow: "hidden", background: "var(--bg)", display: "block" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbProxySrc(p.id)}
                    alt=""
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.title}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: PLATFORM_COLOR[p.platform] ?? "var(--fg-subtle)", marginTop: 2 }}>
                    <PlatformGlyph platform={p.platform} size={10} />
                    <span style={{ color: "var(--fg-subtle)" }}>
                      {new Date(p.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </span>
                </span>
                <span className="tnum" style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "var(--fg)" }}>{fmtK(p.views)}</span>
                <span className="tnum" style={{ textAlign: "right", fontSize: 12, color: "var(--fg-muted)" }}>{fmtK(p.engagements)} eng.</span>
              </a>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 20, textAlign: "center" }}>
          Generated {new Date(data.generatedAt).toLocaleString()} · Clutch Social Tracker
        </div>
      </div>
    </div>
  );
}
