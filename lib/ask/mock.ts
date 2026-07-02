import type { AskContext } from "@/lib/ask/context";
import { executeAskTool } from "@/lib/ask/tools";
import type { AskAnswerSpec } from "@/types/ask";

/**
 * Mock mode — the entire Ask pipeline WITHOUT the Anthropic API: a
 * small keyword parser picks tool parameters, the REAL tool executors
 * run against the REAL database (scope enforcement included), and the
 * answer uses the same block protocol + hydration path as live mode.
 * Costs $0; used when no ANTHROPIC_API_KEY is set or ASK_MOCK=1.
 */

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const fmtK = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

interface MockPlan {
  tool: "query_posts" | "query_content_pieces" | "query_period_stats";
  args: Record<string, unknown>;
  interpretation: string;
}

export function parseMockQuestion(ctx: AskContext, question: string): MockPlan {
  const q = question.toLowerCase();
  const args: Record<string, unknown> = {};
  const notes: string[] = [];

  // — date range —
  let start: Date;
  let end: Date;
  const todayUtc = new Date(`${ctx.today}T00:00:00Z`);
  const monthIdx = MONTHS.findIndex((m) => q.includes(m));
  const yearMatch = q.match(/\b(20\d{2})\b/);
  if (monthIdx >= 0) {
    const year = yearMatch ? Number(yearMatch[1]) : todayUtc.getUTCFullYear();
    start = new Date(Date.UTC(year, monthIdx, 1));
    end = new Date(Date.UTC(year, monthIdx + 1, 0));
    notes.push(`${MONTHS[monthIdx][0].toUpperCase()}${MONTHS[monthIdx].slice(1)} ${year}`);
  } else if (q.includes("yesterday")) {
    // Exactly yesterday — one calendar day, today excluded.
    start = new Date(todayUtc.getTime() - 86400000);
    end = start;
    notes.push("yesterday");
  } else {
    // "Last N days" = an N-day window ENDING today (inclusive):
    // start = today − (N−1). The old −N math produced N+1-day windows.
    const lastN = q.match(/last\s+(\d{1,3})\s+days?/);
    const days = lastN ? Number(lastN[1]) : q.includes("this week") ? 7 : 30;
    end = todayUtc;
    start = new Date(todayUtc.getTime() - (days - 1) * 86400000);
    notes.push(`last ${days} days`);
  }
  args.start_date = start.toISOString().slice(0, 10);
  args.end_date = end.toISOString().slice(0, 10);

  // — platform —
  const platformMap: Record<string, string> = {
    tiktok: "tiktok", youtube: "youtube", instagram: "instagram",
    twitter: "twitter", " x ": "twitter", vk: "vk",
  };
  for (const [kw, platform] of Object.entries(platformMap)) {
    if (q.includes(kw)) {
      args.platform = platform;
      notes.push(platform === "twitter" ? "X" : platform);
      break;
    }
  }

  // — limit —
  const topN = q.match(/(?:top|bottom|worst)\s+(\d{1,2})/);
  args.limit = topN ? Math.min(Number(topN[1]), 50) : 10;

  // — sort —
  if (q.includes("engagement rate")) args.sort_by = "engagement_rate";
  else if (q.includes("engagement")) args.sort_by = "engagements";

  // — direction —
  const wantsWorst = /(worst|lowest|bottom|least|underperform|flop)/.test(q);
  if (wantsWorst) args.direction = "bottom";

  // — format (house definitions) —
  if (/(short[- ]?form|shorts|reels?)\b/.test(q)) {
    args.format = "short-form";
    notes.push("short-form");
  } else if (/long[- ]?form/.test(q)) {
    args.format = "long-form";
    notes.push("long-form");
  }

  // — tool choice —
  let tool: MockPlan["tool"] = "query_posts";
  if (/(content pieces?|cross[- ]platform|cross[- ]posted|\bpieces\b|content posts)/.test(q)) {
    tool = "query_content_pieces";
    delete args.platform;
    delete args.sort_by;
    notes.push("cross-platform pieces");
  } else if (/(how many|total|overall|summary|compare|per platform|by platform|followers)/.test(q)) {
    tool = "query_period_stats";
    if (/(per|by)\s+platform|compare/.test(q)) args.group_by = "platform";
    delete args.platform;
    delete args.limit;
    delete args.sort_by;
    notes.push("period totals");
  } else {
    const metricLabel =
      args.sort_by === "engagements" ? " by engagements" : args.sort_by === "engagement_rate" ? " by eng. rate" : " by views";
    notes.push(`${wantsWorst ? "worst" : "top"} ${args.limit} posts${metricLabel}`);
  }

  return { tool, args, interpretation: notes.join(" · ") };
}

export async function runMockAsk(ctx: AskContext, question: string): Promise<AskAnswerSpec> {
  const plan = parseMockQuestion(ctx, question);
  const { result, error } = await executeAskTool(ctx, plan.tool, plan.args);

  const blocks: AskAnswerSpec["blocks"] = [];
  const suggestions = [
    "Top 10 posts this month",
    "Compare platforms over the last 30 days",
    "Best cross-platform content pieces this quarter",
  ];

  if (error || !result) {
    blocks.push({ type: "text", text: `Couldn't run that query: ${error ?? "unknown error"}` });
    blocks.push({ type: "note", text: "Mock mode uses a simple keyword parser — try phrasing like “top 10 posts in May 2026”." });
    return { blocks, suggestions };
  }

  const r = result as Record<string, unknown>;

  if (plan.tool === "query_posts") {
    const posts = (r.posts as Array<Record<string, unknown>>) ?? [];
    const totalViews = posts.reduce((s, p) => s + Number(p.views), 0);
    const totalEng = posts.reduce((s, p) => s + Number(p.likes) + Number(p.comments) + Number(p.shares), 0);
    blocks.push({
      type: "text",
      text: `Interpreted as: ${plan.interpretation}. Found ${r.total_matching} matching posts — showing the top ${posts.length}.`,
    });
    if (posts.length > 0) {
      blocks.push({
        type: "kpi",
        items: [
          { label: `Combined views (${plan.args.direction === "bottom" ? "worst" : "top"} set)`, value: fmtK(totalViews) },
          { label: "Combined engagements", value: fmtK(totalEng) },
          { label: "Posts in range", value: String(r.total_matching) },
        ],
      });
      blocks.push({
        type: "posts",
        title: plan.args.direction === "bottom" ? "Worst-performing posts" : "Top posts",
        post_ids: posts.map((p) => String(p.id)),
        display: "table",
      });
    }
  } else if (plan.tool === "query_content_pieces") {
    const pieces = (r.pieces as Array<Record<string, unknown>>) ?? [];
    blocks.push({
      type: "text",
      text: `Interpreted as: ${plan.interpretation}. ${r.total_pieces} content pieces in range — top ${pieces.length} by combined views.`,
    });
    if (pieces.length > 0) {
      blocks.push({
        type: "table",
        title: "Top content pieces (combined across platforms)",
        columns: ["Piece", "Platforms", "Views", "Engagements", "Eng. rate"],
        rows: pieces.map((p) => [
          String(p.title),
          (p.platforms as string[]).map((x) => (x === "twitter" ? "X" : x)).join(", "),
          fmtK(Number(p.total_views)),
          fmtK(Number(p.total_engagements)),
          `${p.engagement_rate}%`,
        ]),
      });
      blocks.push({
        type: "posts",
        title: "Placements of the #1 piece",
        post_ids: (pieces[0].member_post_ids as string[]) ?? [],
        display: "table",
      });
    }
  } else {
    const groups = (r.groups as Array<Record<string, unknown>>) ?? [];
    const total = { posts: 0, views: 0, eng: 0 };
    for (const g of groups) {
      total.posts += Number(g.posts);
      total.views += Number(g.views);
      total.eng += Number(g.engagements);
    }
    blocks.push({ type: "text", text: `Interpreted as: ${plan.interpretation}.` });
    blocks.push({
      type: "kpi",
      items: [
        { label: "Posts", value: String(total.posts) },
        { label: "Views", value: fmtK(total.views) },
        { label: "Engagements", value: fmtK(total.eng) },
        ...(r.followers_gained != null ? [{ label: "Followers gained", value: `+${fmtK(Number(r.followers_gained))}` }] : []),
      ],
    });
    if (groups.length > 1) {
      blocks.push({
        type: "chart",
        chart: "bar",
        title: "Views by group",
        labels: groups.map((g) => (String(g.group) === "twitter" ? "X" : String(g.group))),
        series: [{ name: "Views", values: groups.map((g) => Number(g.views)) }],
      });
      blocks.push({
        type: "table",
        columns: ["Group", "Posts", "Views", "Engagements", "Eng. rate", "Views/post"],
        rows: groups.map((g) => [
          String(g.group) === "twitter" ? "X" : String(g.group),
          String(g.posts),
          fmtK(Number(g.views)),
          fmtK(Number(g.engagements)),
          `${g.engagement_rate}%`,
          fmtK(Number(g.views_per_post)),
        ]),
      });
    }
    if (r.followers_note) blocks.push({ type: "note", text: String(r.followers_note) });
  }

  blocks.push({
    type: "note",
    text: "Mock mode: a keyword parser interpreted your question (no AI, $0). Real data, real scope. Add ANTHROPIC_API_KEY to enable full natural-language answers.",
  });
  return { blocks, suggestions, period_label: plan.interpretation };
}
