import { z } from "zod";
import { prisma } from "@/lib/db";
import { getLatestMetrics, metricValue } from "@/lib/metrics-helper";
import { buildPostTypeFilter, CONTENT_FORMATS } from "@/lib/post-format";
import type { AskContext } from "@/lib/ask/context";
import type { AskAnswerSpec, AskBlock, AskPostsBlockSpec } from "@/types/ask";
import type { Platform, PostType } from "@prisma/client";

/* ————————————————————————————————————————————————————————————————
 * Tool definitions (Anthropic Messages API `tools` array).
 * Deterministic module-level constant → stable bytes → cacheable
 * prefix. Note there is NO organization/account/profile-ID parameter
 * anywhere: identity comes exclusively from the server-built context.
 * ———————————————————————————————————————————————————————————————— */

const PLATFORM_ENUM = ["youtube", "twitter", "instagram", "tiktok", "vk"];
const POST_TYPE_ENUM = ["video", "short", "image", "carousel", "slideshow", "text", "live", "story"];

export const ASK_TOOLS = [
  {
    name: "query_posts",
    description:
      "Query individual posts in the user's scope. Returns posts sorted by the chosen metric with their latest cumulative totals (views, likes, comments, shares, engagement rate). Use for questions about specific posts, top posts, per-platform posts, or posts matching a tag/keyword. Call this when the user asks about current numbers — do not answer from memory.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: { type: "string", description: "Inclusive ISO date (YYYY-MM-DD) the posts were PUBLISHED from." },
        end_date: { type: "string", description: "Inclusive ISO date (YYYY-MM-DD) the posts were published to." },
        platform: { type: "string", enum: PLATFORM_ENUM, description: "Optional single-platform filter. 'twitter' = X." },
        format: {
          type: "string",
          enum: [...CONTENT_FORMATS],
          description:
            "PREFERRED format filter using this workspace's definitions: 'short-form' = YouTube Shorts + TikTok videos + Instagram reels (cross-platform — NOT just YouTube); 'long-form' = regular YouTube videos; 'video' = any video; 'image' = images + slideshows. Use this for concepts like shorts/reels/short-form.",
        },
        post_type: { type: "string", enum: POST_TYPE_ENUM, description: "Exact raw post type. Only when the user means one specific type (e.g. carousels); for 'short-form'/'shorts'/'reels' use `format` instead." },
        tag: { type: "string", description: "Optional tag filter — must be one of the available tags listed in your context." },
        search: { type: "string", description: "Optional case-insensitive keyword matched against post titles/captions." },
        profile_name: { type: "string", description: "Optional profile (region) name to narrow to, e.g. 'PUBG Esports KR'. Must match a profile the user can access." },
        sort_by: { type: "string", enum: ["views", "engagements", "engagement_rate", "published_at"], description: "Metric to rank by. Default views." },
        direction: { type: "string", enum: ["top", "bottom"], description: "top = best first (default); bottom = WORST first — use for 'worst performing', 'lowest', 'least viewed' questions." },
        limit: { type: "integer", description: "How many posts to return. Default 10, max 50." },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "query_period_stats",
    description:
      "Aggregate stats for a date range: total posts, views, engagements, engagement rate, views per post — optionally grouped by platform, content format, or month. Also returns followers gained (when tracking coverage exists). Use for totals, comparisons between platforms/formats, and trend questions. For comparing two periods, call it once per period.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: { type: "string", description: "Inclusive ISO date (YYYY-MM-DD)." },
        end_date: { type: "string", description: "Inclusive ISO date (YYYY-MM-DD)." },
        group_by: { type: "string", enum: ["none", "platform", "post_type", "month"], description: "Default none (single total row)." },
        format: {
          type: "string",
          enum: [...CONTENT_FORMATS],
          description: "Optional format filter — 'short-form' = YouTube Shorts + TikTok videos + Instagram reels (this workspace's definition).",
        },
        tag: { type: "string", description: "Optional tag filter." },
        profile_name: { type: "string", description: "Optional profile (region) name to narrow to." },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "query_content_pieces",
    description:
      "Query cross-platform CONTENT PIECES: the same clip/announcement published on several platforms, grouped, with metrics combined across all placements. Use when the user asks about 'content' performance across platforms, best pieces, or cross-posted material. Returns member post IDs you can show via a posts block.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: { type: "string", description: "Inclusive ISO date (YYYY-MM-DD)." },
        end_date: { type: "string", description: "Inclusive ISO date (YYYY-MM-DD)." },
        multi_platform_only: { type: "boolean", description: "Only pieces published on 2+ platforms. Default false." },
        profile_name: { type: "string", description: "Optional profile (region) name to narrow to." },
        limit: { type: "integer", description: "How many pieces. Default 10, max 25." },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "render_answer",
    description:
      "REQUIRED final step: render the answer for the user as structured blocks. Call this exactly once, after you have the data. Numbers in text/kpi/table/chart blocks must come from tool results — never invent them. For lists of posts prefer a posts block with post_ids from tool results (the server renders real thumbnails and links). Use a chart block for comparisons (bar: platforms/formats) and trends (line: months) — more scannable than a table. Keep text blocks short; 2-3 follow-up suggestions.",
    input_schema: {
      type: "object" as const,
      properties: {
        blocks: {
          type: "array",
          description: "Ordered answer blocks.",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["text", "note", "kpi", "table", "chart", "posts"] },
              text: { type: "string", description: "For text/note blocks." },
              items: {
                type: "array",
                description: "For kpi blocks: 2-5 headline stats.",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    value: { type: "string" },
                    sub: { type: "string" },
                  },
                  required: ["label", "value"],
                },
              },
              title: { type: "string", description: "For table/chart/posts blocks." },
              columns: { type: "array", items: { type: "string" }, description: "For table blocks." },
              rows: { type: "array", items: { type: "array", items: { type: "string" } }, description: "For table blocks." },
              chart: { type: "string", enum: ["bar", "line"], description: "For chart blocks: bar = category comparison (platforms, formats), line = time series (months/days)." },
              labels: { type: "array", items: { type: "string" }, description: "For chart blocks: x-axis categories, max 31." },
              series: {
                type: "array",
                description: "For chart blocks: 1-3 named series; values align with labels by index and MUST come from tool results.",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    values: { type: "array", items: { type: "number" } },
                  },
                  required: ["name", "values"],
                },
              },
              post_ids: { type: "array", items: { type: "string" }, description: "For posts blocks: IDs from tool results, max 20." },
              display: { type: "string", enum: ["table", "cards"], description: "For posts blocks. Default table." },
            },
            required: ["type"],
          },
        },
        suggestions: { type: "array", items: { type: "string" }, description: "2-3 follow-up questions the user might ask next." },
        period_label: { type: "string", description: "Short label of the period answered about, e.g. 'May 2026'." },
      },
      required: ["blocks"],
    },
  },
];

/* ———————————————————————— answer spec validation ———————————————————————— */

const answerSpecSchema = z.object({
  blocks: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("text"), text: z.string().min(1) }),
        z.object({ type: z.literal("note"), text: z.string().min(1) }),
        z.object({
          type: z.literal("kpi"),
          items: z
            .array(z.object({ label: z.string(), value: z.string(), sub: z.string().optional() }))
            .min(1)
            .max(6),
        }),
        z.object({
          type: z.literal("table"),
          title: z.string().optional(),
          columns: z.array(z.string()).min(1).max(8),
          rows: z.array(z.array(z.string())).max(30),
        }),
        z.object({
          type: z.literal("chart"),
          chart: z.enum(["bar", "line"]),
          title: z.string().optional(),
          labels: z.array(z.string()).min(1).max(31),
          series: z
            .array(z.object({ name: z.string(), values: z.array(z.number().finite()).min(1).max(31) }))
            .min(1)
            .max(3),
        }),
        z.object({
          type: z.literal("posts"),
          title: z.string().optional(),
          post_ids: z.array(z.string()).min(1).max(20),
          display: z.enum(["table", "cards"]).optional(),
        }),
      ])
    )
    .min(1)
    .max(8),
  suggestions: z.array(z.string()).max(4).optional(),
  period_label: z.string().optional(),
});

export function validateAnswerSpec(input: unknown): { ok: true; spec: AskAnswerSpec } | { ok: false; error: string } {
  const parsed = answerSpecSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, spec: parsed.data as AskAnswerSpec };
}

/* ———————————————————————— shared helpers ———————————————————————— */

class ToolError extends Error {}

function parseDateRange(args: Record<string, unknown>): { start: Date; end: Date } {
  const start = new Date(`${args.start_date}T00:00:00.000Z`);
  const end = new Date(`${args.end_date}T23:59:59.999Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ToolError("Invalid date — use YYYY-MM-DD for start_date and end_date.");
  }
  if (start > end) throw new ToolError("start_date is after end_date.");
  return { start, end };
}

/**
 * Resolve the model-supplied profile_name to account IDs — STRICTLY
 * within the user's permission set. Unknown or inaccessible names
 * return a tool error (so the model answers honestly) instead of
 * silently falling back to a different scope.
 */
function resolveAccountIds(ctx: AskContext, args: Record<string, unknown>): string[] {
  const name = typeof args.profile_name === "string" ? args.profile_name.trim() : "";
  if (!name) return ctx.accounts.map((a) => a.id);

  let match = ctx.visibleProfiles.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!match) {
    // Substring fallback must be UNAMBIGUOUS — silently picking the
    // alphabetically-first of several matches would present one
    // region's numbers as the answer for all of them.
    const candidates = ctx.visibleProfiles.filter((p) => p.name.toLowerCase().includes(name.toLowerCase()));
    if (candidates.length > 1) {
      throw new ToolError(
        `Profile name "${name}" is ambiguous — it matches: ${candidates.map((p) => p.name).join(", ")}. Use the full name, or omit profile_name to cover all of them.`
      );
    }
    match = candidates[0];
  }
  if (!match) {
    throw new ToolError(
      `No accessible profile named "${name}". This user can access: ${ctx.visibleProfiles.map((p) => p.name).join(", ")}.`
    );
  }
  const ids = ctx.accounts.filter((a) => a.profileId === match.id).map((a) => a.id);
  if (ids.length === 0) {
    throw new ToolError(
      `Profile "${match.name}" has no accounts in the user's current scope (${ctx.scopeLabel}). Ask them to switch profile scope.`
    );
  }
  return ids;
}

/** One-line, truncated, newline-free caption — scraped social captions
 *  are untrusted text; keep them short and inert inside tool results. */
function cleanTitle(title: string | null, description: string | null): string {
  const raw = (title || description || "").replace(/\s+/g, " ").trim();
  return raw.length > 90 ? `${raw.slice(0, 87)}…` : raw || "Untitled post";
}

// 0-view posts (platforms without view metrics) get rate 0 — eng/(1)
// would otherwise fabricate absurd percentages and dominate rate sorts.
const rate = (eng: number, views: number) => (views > 0 ? Number(((eng / views) * 100).toFixed(2)) : 0);

/* ———————————————————————— executors ———————————————————————— */

const FETCH_CAP = 5000;

async function fetchScopedPosts(
  ctx: AskContext,
  accountIds: string[],
  start: Date,
  end: Date,
  extra: Record<string, unknown>
) {
  const where: Record<string, unknown> = {
    socialAccountId: { in: accountIds },
    publishedAt: { gte: start, lte: end },
    isDeleted: false,
    ...extra,
  };
  if (ctx.hideSponsored) where.isSponsored = false;
  // Real count first — top-N sorting happens in memory (metrics live in
  // a separate table), so a silent fetch cap would otherwise corrupt
  // both totals and rankings. When capped, we say so.
  const totalCount = await prisma.post.count({ where });
  const posts = await prisma.post.findMany({
    where,
    select: {
      id: true,
      platform: true,
      postType: true,
      title: true,
      description: true,
      publishedAt: true,
      contentGroupId: true,
    },
    orderBy: { publishedAt: "desc" },
    take: FETCH_CAP,
  });
  return { posts, totalCount, truncated: totalCount > FETCH_CAP };
}

const truncationNote = (truncated: boolean) =>
  truncated
    ? `Range matched more than ${FETCH_CAP} posts — results computed over the most recent ${FETCH_CAP}. Tell the user to narrow the range for exact figures.`
    : undefined;

async function queryPosts(ctx: AskContext, args: Record<string, unknown>) {
  const { start, end } = parseDateRange(args);
  const accountIds = resolveAccountIds(ctx, args);

  const extra: Record<string, unknown> = {};
  // format and search each produce OR clauses — combine under AND so
  // they never clobber each other.
  const andClauses: Record<string, unknown>[] = [];
  if (typeof args.platform === "string" && PLATFORM_ENUM.includes(args.platform)) {
    extra.platform = args.platform as Platform;
  }
  if (typeof args.format === "string" && (CONTENT_FORMATS as readonly string[]).includes(args.format)) {
    andClauses.push(buildPostTypeFilter(args.format));
  } else if (typeof args.post_type === "string" && POST_TYPE_ENUM.includes(args.post_type)) {
    extra.postType = args.post_type as PostType;
  }
  if (typeof args.tag === "string" && args.tag.trim()) {
    extra.tags = { has: args.tag.trim().toLowerCase() };
  }
  if (typeof args.search === "string" && args.search.trim()) {
    andClauses.push({
      OR: [
        { title: { contains: args.search.trim(), mode: "insensitive" } },
        { description: { contains: args.search.trim(), mode: "insensitive" } },
      ],
    });
  }
  if (andClauses.length > 0) extra.AND = andClauses;

  const { posts, totalCount, truncated } = await fetchScopedPosts(ctx, accountIds, start, end, extra);
  const metrics = await getLatestMetrics(posts.map((p) => p.id));

  const enriched = posts.map((p) => {
    const views = metricValue(metrics, p.id, "views");
    const likes = metricValue(metrics, p.id, "likes");
    const comments = metricValue(metrics, p.id, "comments");
    const shares = metricValue(metrics, p.id, "shares");
    const engagements = likes + comments + shares;
    return { p, views, likes, comments, shares, engagements, engagementRate: rate(engagements, views) };
  });

  const sortBy = (args.sort_by as string) || "views";
  enriched.sort((a, b) => {
    if (sortBy === "engagements") return b.engagements - a.engagements;
    if (sortBy === "engagement_rate") return b.engagementRate - a.engagementRate;
    if (sortBy === "published_at") return b.p.publishedAt.getTime() - a.p.publishedAt.getTime();
    return b.views - a.views;
  });
  if (args.direction === "bottom") enriched.reverse();

  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  return {
    total_matching: totalCount,
    returned: Math.min(limit, enriched.length),
    note: truncationNote(truncated),
    posts: enriched.slice(0, limit).map((e) => ({
      id: e.p.id,
      platform: e.p.platform,
      type: e.p.postType,
      title: cleanTitle(e.p.title, e.p.description),
      published_at: e.p.publishedAt.toISOString().slice(0, 10),
      views: e.views,
      likes: e.likes,
      comments: e.comments,
      shares: e.shares,
      engagement_rate: e.engagementRate,
    })),
  };
}

async function queryPeriodStats(ctx: AskContext, args: Record<string, unknown>) {
  const { start, end } = parseDateRange(args);
  const accountIds = resolveAccountIds(ctx, args);

  const extra: Record<string, unknown> = {};
  if (typeof args.tag === "string" && args.tag.trim()) {
    extra.tags = { has: args.tag.trim().toLowerCase() };
  }
  if (typeof args.format === "string" && (CONTENT_FORMATS as readonly string[]).includes(args.format)) {
    extra.AND = [buildPostTypeFilter(args.format)];
  }

  const { posts, truncated } = await fetchScopedPosts(ctx, accountIds, start, end, extra);
  const metrics = await getLatestMetrics(posts.map((p) => p.id));

  const groupBy = (args.group_by as string) || "none";
  const keyOf = (p: (typeof posts)[number]) => {
    if (groupBy === "platform") return p.platform;
    if (groupBy === "post_type") return p.postType;
    if (groupBy === "month") return p.publishedAt.toISOString().slice(0, 7);
    return "total";
  };

  const groups = new Map<string, { posts: number; views: number; engagements: number }>();
  for (const p of posts) {
    const views = metricValue(metrics, p.id, "views");
    const engagements =
      metricValue(metrics, p.id, "likes") + metricValue(metrics, p.id, "comments") + metricValue(metrics, p.id, "shares");
    const g = groups.get(keyOf(p)) ?? { posts: 0, views: 0, engagements: 0 };
    g.posts += 1;
    g.views += views;
    g.engagements += engagements;
    groups.set(keyOf(p), g);
  }

  const rollup = await prisma.accountDailyRollup.aggregate({
    where: { socialAccountId: { in: accountIds }, rollupDate: { gte: start, lte: end } },
    _sum: { newFollowers: true },
    _count: { _all: true },
  });
  const followersGained = rollup._count._all > 0 ? Number(rollup._sum.newFollowers ?? 0) : null;
  const followersNote =
    rollup._count._all === 0
      ? `No follower data for this period — tracking began ${ctx.followerTrackingSince ?? "recently"}.`
      : ctx.followerTrackingSince && args.start_date && String(args.start_date) < ctx.followerTrackingSince
        ? `Partial coverage: follower tracking began ${ctx.followerTrackingSince}.`
        : null;

  return {
    groups: Array.from(groups.entries())
      .sort((a, b) => b[1].views - a[1].views)
      .map(([key, g]) => ({
        group: key,
        posts: g.posts,
        views: g.views,
        engagements: g.engagements,
        engagement_rate: rate(g.engagements, g.views),
        views_per_post: g.posts > 0 ? Math.round(g.views / g.posts) : 0,
      })),
    followers_gained: followersGained,
    followers_note: followersNote,
    note: truncationNote(truncated),
  };
}

async function queryContentPieces(ctx: AskContext, args: Record<string, unknown>) {
  const { start, end } = parseDateRange(args);
  const accountIds = resolveAccountIds(ctx, args);

  // Step 1: which pieces have at least one placement in the range?
  const { posts: inRange, truncated } = await fetchScopedPosts(ctx, accountIds, start, end, {});
  const gids = Array.from(new Set(inRange.map((p) => p.contentGroupId ?? p.id)));

  // Step 2: fetch ALL members of those pieces (still scoped) — a piece
  // often straddles the range boundary (72h cross-post window), and
  // computing "combined" totals from in-range members only would
  // under-report, mislabel (canonical post outside range) and drop
  // straddling pieces from multi_platform_only.
  const memberWhere: Record<string, unknown> = {
    socialAccountId: { in: accountIds },
    isDeleted: false,
    OR: [{ contentGroupId: { in: gids } }, { id: { in: gids } }],
  };
  if (ctx.hideSponsored) memberWhere.isSponsored = false;
  const members = await prisma.post.findMany({
    where: memberWhere,
    select: {
      id: true,
      platform: true,
      postType: true,
      title: true,
      description: true,
      publishedAt: true,
      contentGroupId: true,
    },
  });
  const metrics = await getLatestMetrics(members.map((p) => p.id));

  interface Piece {
    labelPost: (typeof members)[number];
    members: Array<{ id: string; platform: string; views: number; engagements: number }>;
    platforms: Set<string>;
    views: number;
    engagements: number;
  }
  const pieces = new Map<string, Piece>();
  for (const p of members) {
    const gid = p.contentGroupId ?? p.id;
    if (!gids.includes(gid)) continue;
    const views = metricValue(metrics, p.id, "views");
    const engagements =
      metricValue(metrics, p.id, "likes") + metricValue(metrics, p.id, "comments") + metricValue(metrics, p.id, "shares");
    let piece = pieces.get(gid);
    if (!piece) {
      piece = { labelPost: p, members: [], platforms: new Set(), views: 0, engagements: 0 };
      pieces.set(gid, piece);
    }
    // The canonical label post is the group id owner (earliest member);
    // fall back to the chronologically-first member we've seen.
    if (p.id === gid) piece.labelPost = p;
    else if (piece.labelPost.id !== gid && p.publishedAt < piece.labelPost.publishedAt) piece.labelPost = p;
    piece.members.push({ id: p.id, platform: p.platform, views, engagements });
    piece.platforms.add(p.platform);
    piece.views += views;
    piece.engagements += engagements;
  }

  let list = Array.from(pieces.values());
  if (args.multi_platform_only === true) list = list.filter((x) => x.platforms.size >= 2);
  list.sort((a, b) => b.views - a.views);

  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
  return {
    total_pieces: list.length,
    returned: Math.min(limit, list.length),
    note: truncationNote(truncated),
    pieces: list.slice(0, limit).map((x) => ({
      title: cleanTitle(x.labelPost.title, x.labelPost.description),
      platforms: Array.from(x.platforms),
      post_count: x.members.length,
      total_views: x.views,
      total_engagements: x.engagements,
      engagement_rate: rate(x.engagements, x.views),
      published_at: x.labelPost.publishedAt.toISOString().slice(0, 10),
      member_post_ids: x.members
        .sort((a, b) => b.views - a.views)
        .slice(0, 8)
        .map((m) => m.id),
    })),
  };
}

/** Dispatch a model tool call. Returns {result} or {error} — never throws. */
export async function executeAskTool(
  ctx: AskContext,
  name: string,
  args: Record<string, unknown>
): Promise<{ result?: unknown; error?: string }> {
  try {
    if (name === "query_posts") return { result: await queryPosts(ctx, args) };
    if (name === "query_period_stats") return { result: await queryPeriodStats(ctx, args) };
    if (name === "query_content_pieces") return { result: await queryContentPieces(ctx, args) };
    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    if (err instanceof ToolError) return { error: err.message };
    console.error(`[Ask] Tool ${name} failed:`, err);
    return { error: "Query failed — try adjusting the parameters." };
  }
}

/* ———————————————————————— hydration ———————————————————————— */

/**
 * Replace posts-block ID lists with real scoped rows. IDs outside the
 * user's scope are silently dropped — the model can NAME any post, but
 * can never surface data the user couldn't query directly.
 */
export async function hydrateAnswer(ctx: AskContext, spec: AskAnswerSpec): Promise<AskBlock[]> {
  const scopeAccountIds = ctx.accounts.map((a) => a.id);
  const blocks: AskBlock[] = [];

  for (const block of spec.blocks) {
    if (block.type !== "posts") {
      blocks.push(block);
      continue;
    }
    const specBlock = block as AskPostsBlockSpec;
    const ids = specBlock.post_ids.slice(0, 20);
    const rows = await prisma.post.findMany({
      // Same filters as the query tools — including hideSponsored, or
      // a supplied ID could smuggle a hidden sponsored post past the
      // org setting via render_answer.
      where: {
        id: { in: ids },
        socialAccountId: { in: scopeAccountIds },
        isDeleted: false,
        ...(ctx.hideSponsored ? { isSponsored: false } : {}),
      },
      select: {
        id: true,
        platform: true,
        postType: true,
        title: true,
        description: true,
        contentUrl: true,
        thumbnailUrl: true,
        publishedAt: true,
      },
    });
    const metrics = await getLatestMetrics(rows.map((r) => r.id));
    const byId = new Map(rows.map((r) => [r.id, r]));

    const posts = ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => {
        const views = metricValue(metrics, r.id, "views");
        const likes = metricValue(metrics, r.id, "likes");
        const comments = metricValue(metrics, r.id, "comments");
        const shares = metricValue(metrics, r.id, "shares");
        const engagements = likes + comments + shares;
        return {
          id: r.id,
          platform: r.platform,
          postType: r.postType,
          title: cleanTitle(r.title, r.description),
          contentUrl: r.contentUrl,
          thumbnailUrl: r.thumbnailUrl,
          publishedAt: r.publishedAt.toISOString(),
          views,
          likes,
          comments,
          shares,
          engagementRate: rate(engagements, views),
        };
      });

    if (posts.length > 0) {
      blocks.push({
        type: "posts",
        title: specBlock.title,
        display: specBlock.display ?? "table",
        posts,
      });
    }
  }
  return blocks;
}
