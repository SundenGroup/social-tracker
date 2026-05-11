/**
 * Post tagging engine.
 *
 * Used by:
 *   - app/api/sync/ingest/route.ts        (auto-tag at ingest)
 *   - app/api/accounts/[id]/route.ts      (recompute on rule save)
 *   - app/api/posts/[id]/route.ts         (recompute on manual override)
 *
 * Design notes (see plan: post tagging + per-partner content filter):
 *   - Tags + hashtags + mentions are stored canonical-lowercase.
 *   - `Post.tags` is the queryable union of auto + manual.
 *   - `Post.manualTags` survives every recompute (auto-tagging never
 *     strips human-pinned tags).
 *   - Rule-matching runs on the RAW caption text, before sanitize()'s
 *     500-char description truncation, so hashtags at the end of long
 *     captions still register.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// ───────────────────────── types ─────────────────────────

/**
 * One auto-tag rule. A post matches the rule if ANY of:
 *   - any element of `hashtags` (canonical, no leading #) appears as a
 *     hashtag in the caption
 *   - any element of `mentions` (canonical, no leading @) appears as a
 *     mention in the caption
 *   - any element of `keywords` appears as a case-insensitive substring
 *     in title or description
 *
 * `alwaysOn` is a UI hint, not a tagging-engine input — when true, the
 * dashboard pre-selects this rule's `tag` as the default filter for
 * profiles in scope. Toggling the filter pill off temporarily clears
 * it; switching profiles re-applies the default.
 */
export interface TagRule {
  /** Canonical-lowercase tag value. Used for matching, indexing, and
   *  filtering. Load-bearing — every consumer of `Post.tags` assumes
   *  lowercase. */
  tag: string;
  /** Optional display label preserving the user's original casing
   *  (e.g. "PEC"). Defaults to `tag` when not present. UI surfaces use
   *  this for rendering; matching/storage ignore it. */
  displayTag?: string;
  hashtags?: string[];
  mentions?: string[];
  keywords?: string[];
  alwaysOn?: boolean;
}

/** SocialAccount-level tagging configuration. */
export interface AccountTagConfig {
  defaultTags: string[];
  tagRules: TagRule[] | null;
}

// ───────────────────────── extractors ─────────────────────────

/**
 * Pull hashtags out of caption text. Returns canonical-lowercase
 * tokens with no leading `#`. Word characters only — Instagram's
 * hashtag rules align with `\w` (letters / digits / underscore),
 * which also covers TikTok and X.
 */
export function extractHashtags(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  for (const m of text.matchAll(/#([A-Za-z0-9_]+)/g)) {
    out.add(m[1].toLowerCase());
  }
  return out;
}

/**
 * Pull mentions out of caption text. Returns canonical-lowercase
 * handles with no leading `@`. Allows letters / digits / underscore /
 * dot / hyphen — covers IG, TikTok, X, and YouTube handle conventions.
 */
export function extractMentions(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  for (const m of text.matchAll(/@([A-Za-z0-9_.-]+)/g)) {
    out.add(m[1].toLowerCase());
  }
  return out;
}

/** Lowercase a list, drop empties, dedupe. */
function canonicalize(list: string[] | undefined): string[] {
  if (!list) return [];
  const out = new Set<string>();
  for (const v of list) {
    const s = String(v ?? "").trim().toLowerCase();
    if (s) out.add(s);
  }
  return Array.from(out);
}

// ───────────────────────── core ─────────────────────────

/**
 * Validate + canonicalize whatever the API received as `tagRules`. Used
 * by the per-account PUT route. Reject empty rules — a rule with no
 * match criteria would tag nothing, so the user almost certainly made a
 * typo. Returns the cleaned rule list, or throws on invalid shape.
 */
export function parseTagRules(input: unknown): TagRule[] {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new Error("tagRules must be an array");
  }
  const out: TagRule[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      throw new Error("Each tag rule must be an object");
    }
    const r = raw as Record<string, unknown>;
    const rawTag = typeof r.tag === "string" ? r.tag.trim() : "";
    const tag = rawTag.toLowerCase();
    if (!tag) throw new Error("Tag rule is missing `tag`");
    // Capture the user's original casing as displayTag. If the client
    // sent an explicit displayTag we honour that, otherwise we fall
    // back to the trimmed-but-uncased input from `tag`. We only persist
    // displayTag when it differs from `tag` (avoids bloating the JSON
    // with redundant lowercase duplicates).
    const explicitDisplay =
      typeof r.displayTag === "string" ? r.displayTag.trim() : "";
    const displayCandidate = explicitDisplay || rawTag;
    const displayTag = displayCandidate !== tag ? displayCandidate : undefined;
    const hashtags = Array.isArray(r.hashtags)
      ? canonicalize(r.hashtags as string[]).map((h) => h.replace(/^#+/, ""))
      : [];
    const mentions = Array.isArray(r.mentions)
      ? canonicalize(r.mentions as string[]).map((m) => m.replace(/^@+/, ""))
      : [];
    const keywords = Array.isArray(r.keywords) ? canonicalize(r.keywords as string[]) : [];
    if (hashtags.length === 0 && mentions.length === 0 && keywords.length === 0) {
      throw new Error(
        `Rule "${tag}" must specify at least one of hashtags / mentions / keywords`
      );
    }
    const alwaysOn = r.alwaysOn === true;
    out.push({
      tag,
      ...(displayTag ? { displayTag } : {}),
      hashtags,
      mentions,
      keywords,
      alwaysOn,
    });
  }
  return out;
}

/**
 * Compute the auto-tag set for a post given its account's config. Does
 * NOT include `manualTags` — caller is expected to union with those
 * before writing `Post.tags`.
 */
export function computeAutoTags(
  post: { title?: string | null; description?: string | null },
  account: AccountTagConfig
): string[] {
  const out = new Set<string>(canonicalize(account.defaultTags));

  const rules = account.tagRules ?? [];
  if (rules.length === 0) return Array.from(out);

  // Combine title + description for matching. Both are scanned for
  // hashtags / mentions / keywords. Title is short and rarely contains
  // hashtags, but doesn't hurt to include it.
  const text = `${post.title ?? ""} ${post.description ?? ""}`;
  const hashtagSet = extractHashtags(text);
  const mentionSet = extractMentions(text);
  const lowerText = text.toLowerCase();

  for (const rule of rules) {
    let matched = false;
    if (rule.hashtags && rule.hashtags.some((h) => hashtagSet.has(h))) matched = true;
    if (!matched && rule.mentions && rule.mentions.some((m) => mentionSet.has(m))) matched = true;
    if (!matched && rule.keywords && rule.keywords.some((k) => lowerText.includes(k))) matched = true;
    if (matched) out.add(rule.tag);
  }
  return Array.from(out);
}

/**
 * Final tag set for a post: `auto ∪ manual`. Returns canonical
 * lowercase, deduped. This is the value to write to `Post.tags`.
 */
export function effectiveTags(autoTags: string[], manualTags: string[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const t of canonicalize(autoTags)) out.add(t);
  for (const t of canonicalize(manualTags ?? [])) out.add(t);
  return Array.from(out);
}

// ───────────────────────── filter helper ─────────────────────────

/**
 * Sentinel value the tag-filter UI puts in the selected-tags array to
 * mean "match posts with no tags at all". Distinct from an empty
 * selection (which means "no tag filter"). The string is kept
 * deliberately ugly so it can't collide with a real user-typed tag.
 */
export const UNTAGGED_FILTER = "__untagged";

/**
 * Build a Prisma where-fragment for filtering posts by tag(s).
 *
 * Accepts a single tag (legacy callers) or an array (multi-select
 * filter). Multiple tags use OR semantics — a post matches if ANY of
 * the requested tags is on it (`hasSome`). Returns `{}` when the input
 * is null / empty / all-blank so the caller can spread it
 * unconditionally into a wider where clause.
 *
 * `UNTAGGED_FILTER` is special: when present, posts with an empty
 * `tags` array also match. Combines OR-wise with any real tags in the
 * same array.
 *
 * All inputs are canonicalised to lowercase since tags are stored that
 * way (see the canonical-lowercase invariant in this file's header).
 */
export function tagFilterWhere(
  tag: string | string[] | null | undefined
): Prisma.PostWhereInput {
  if (!tag) return {};
  const raw = Array.isArray(tag) ? tag : [tag];
  let wantUntagged = false;
  const canonical: string[] = [];
  for (const t of raw) {
    const value = String(t ?? "").trim();
    if (value === UNTAGGED_FILTER) {
      wantUntagged = true;
      continue;
    }
    const c = value.toLowerCase();
    if (c) canonical.push(c);
  }
  if (!wantUntagged) {
    if (canonical.length === 0) return {};
    if (canonical.length === 1) return { tags: { has: canonical[0] } };
    return { tags: { hasSome: canonical } };
  }
  // wantUntagged === true
  const untaggedFragment: Prisma.PostWhereInput = { tags: { equals: [] } };
  if (canonical.length === 0) return untaggedFragment;
  const taggedFragment: Prisma.PostWhereInput =
    canonical.length === 1
      ? { tags: { has: canonical[0] } }
      : { tags: { hasSome: canonical } };
  // Wrap the OR in a single-element AND so that callers which spread
  // this fragment into a wider where clause don't end up with a
  // top-level OR collision (e.g. period-comparison's short-form
  // content filter already produces its own OR). AND coexists fine
  // with any existing OR on the host where.
  return { AND: [{ OR: [untaggedFragment, taggedFragment] }] };
}

/**
 * Account-config helper used by ingest. Pulls just the fields the tag
 * engine needs from a SocialAccount row; safe to receive a full row or
 * a subset. Returns a normalised `AccountTagConfig` ready for
 * `computeAutoTags`.
 */
export function accountTagConfig(account: {
  defaultTags: string[];
  tagRules: Prisma.JsonValue | null;
}): AccountTagConfig {
  let rules: TagRule[] | null = null;
  try {
    if (account.tagRules) {
      // tagRules is already validated at write-time, so we just narrow
      // the type. If somehow corrupted, fall back to no rules — better
      // than 500-ing every ingest.
      rules = parseTagRules(account.tagRules);
    }
  } catch {
    rules = null;
  }
  return {
    defaultTags: canonicalize(account.defaultTags),
    tagRules: rules,
  };
}

/**
 * Recompute tags for every (non-deleted) post on an account. Called
 * after the admin edits the account's defaultTags or tagRules so
 * historical posts pick up new rule matches immediately.
 *
 * Implementation note: we DON'T wrap this in a single Prisma
 * transaction. A 3,000-post account would hold the connection for
 * tens of seconds and risk pool-timeout. Instead we process in chunks
 * of 500 with idempotent updates. If a concurrent ingest writes a
 * different value mid-recompute, the subsequent recompute pass on
 * the same row converges to the same state (auto = computeAutoTags(),
 * union with manualTags).
 *
 * Returns the count of posts whose tags actually changed (for UI
 * feedback like "Re-tagged 1,234 historical posts").
 */
export async function recomputeAccountTags(accountId: string): Promise<number> {
  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    select: { id: true, defaultTags: true, tagRules: true },
  });
  if (!account) throw new Error(`SocialAccount not found: ${accountId}`);
  const config = accountTagConfig(account);

  let cursor: string | null = null;
  let changed = 0;
  const CHUNK = 500;

  for (;;) {
    const batch: Array<{
      id: string;
      title: string | null;
      description: string | null;
      tags: string[];
      manualTags: string[];
    }> = await prisma.post.findMany({
      where: {
        socialAccountId: accountId,
        isDeleted: false,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, title: true, description: true, tags: true, manualTags: true },
      orderBy: { id: "asc" },
      take: CHUNK,
    });
    if (batch.length === 0) break;

    for (const p of batch) {
      const auto = computeAutoTags({ title: p.title, description: p.description }, config);
      const next = effectiveTags(auto, p.manualTags);
      // Only write if actually different — avoids unnecessary index
      // churn on the GIN index. Cheap array compare since these are
      // tiny lists.
      const prev = p.tags;
      if (
        next.length !== prev.length ||
        next.some((t, i) => t !== prev[i]) ||
        prev.some((t) => !next.includes(t))
      ) {
        await prisma.post.update({
          where: { id: p.id },
          data: { tags: next },
        });
        changed++;
      }
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < CHUNK) break;
  }
  return changed;
}

/**
 * Recompute tags for ONE post — used by the per-post PATCH route after
 * `manualTags` is updated. Loads the account config + the latest post
 * data, then writes `tags = autoTags ∪ manualTags`.
 */
export async function recomputePostTags(postId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      title: true,
      description: true,
      manualTags: true,
      socialAccount: { select: { defaultTags: true, tagRules: true } },
    },
  });
  if (!post) throw new Error(`Post not found: ${postId}`);
  const config = accountTagConfig(post.socialAccount);
  const auto = computeAutoTags({ title: post.title, description: post.description }, config);
  const next = effectiveTags(auto, post.manualTags);
  await prisma.post.update({
    where: { id: postId },
    data: { tags: next },
  });
}
