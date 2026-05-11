import type {
  Platform,
  PostType,
  MetricType,
  SyncStatus,
  ContentFilter,
  UserRole,
} from "@prisma/client";

// ============ API Response Wrapper ============

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ============ User ============

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
}

// ============ Social Accounts ============

export interface ProfileResponse {
  id: string;
  name: string;
  isDefault: boolean;
  organizationId: string;
  accountCount?: number;
  /** Distinct platforms this profile has active connections for.
   *  Used by the Sidebar to hide platform nav items with no data here. */
  platforms?: string[];
  /** Distinct tags applied to any non-deleted post under this profile.
   *  Used by the dashboard tag-filter strip; only rendered when
   *  non-empty. */
  tags?: string[];
  /** Does this profile have at least one post with an empty tags array?
   *  Drives the "hide single-tag toggle when 100% coverage" UX —
   *  if the only tag covers every post, the filter does nothing. */
  hasUntaggedPosts?: boolean;
  /** When non-null, this tag should be the default-selected filter on
   *  the dashboard / platform pages for this profile. Set by any rule
   *  marked `alwaysOn: true` on any account inside the profile. */
  defaultTagFilter?: string | null;
  /** Subset of `tags` that should always render as visible chips in the
   *  tag-filter strip. Primary = account `defaultTags` ∪ rule tags with
   *  `alwaysOn=true`. Anything else lives behind the "More tags" menu. */
  primaryTags?: string[];
  /** Map from canonical tag → display label. Only present when at least
   *  one tag has a custom-cased displayTag (e.g. {pec: "PEC"}). Renderers
   *  fall back to capitalising the canonical tag when absent. */
  tagDisplayNames?: Record<string, string>;
  createdAt: string;
}

/**
 * One auto-tag rule attached to a SocialAccount. Mirrored from
 * lib/tagging.ts for typing convenience on the frontend.
 */
export interface TagRule {
  /** Canonical-lowercase tag (used everywhere for matching/filtering). */
  tag: string;
  /** User's original-cased label (e.g. "PEC"). Optional — server fills
   *  in from `tag` when absent. Pure presentation, never used in match
   *  logic. */
  displayTag?: string;
  hashtags?: string[];
  mentions?: string[];
  keywords?: string[];
  /** When true, the dashboard pre-selects this rule's tag as the
   *  default filter for any profile in scope. Toggling the filter
   *  pill off temporarily clears it; switching profiles re-applies. */
  alwaysOn?: boolean;
}

export interface SocialAccountResponse {
  id: string;
  platform: Platform;
  accountId: string;
  accountName: string;
  contentFilter: ContentFilter;
  isActive: boolean;
  lastSyncedAt: string | null;
  syncStatus: SyncStatus;
  profileId?: string;
  profileName?: string;
  /** Tags applied to every post from this account (e.g. ["esports"]). */
  defaultTags?: string[];
  /** Auto-tag rules — each emits a tag when caption matches its
   *  hashtags / mentions / keywords. */
  tagRules?: TagRule[] | null;
  createdAt: string;
}

// ============ Posts ============

export interface PostResponse {
  id: string;
  platform: Platform;
  postId: string;
  postType: PostType;
  title: string | null;
  description: string | null;
  contentUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  isTrending: boolean;
  isSponsored: boolean;
}

// ============ Metrics ============

export interface MetricPoint {
  date: string;
  value: number;
}

export interface PostMetricResponse {
  metricType: MetricType;
  metricDate: string;
  metricValue: number;
}

// ============ Dashboard ============

export interface DashboardMetrics {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalImpressions: number;
  totalReach: number;
  engagementRate: number;
  totalPosts: number;
  totalFollowers: number;
  newFollowers: number;
}

export interface DashboardTrend {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  engagementRate: number;
}

// ============ Post Performance ============

export interface PostPerformance {
  id: string;
  platform: Platform;
  postType: PostType;
  title: string | null;
  contentUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  isTrending: boolean;
  isSponsored: boolean;
  /** Effective tags (auto + manual) — used for filtering. */
  tags?: string[];
  /** Tags pinned manually via the per-post popover. Source of truth
   *  for human intent; preserved across rule recomputes. */
  manualTags?: string[];
  /** Tags worth showing inline on a row: rule-matched auto tags +
   *  manual tags. Per-account `defaultTags` are stripped server-side
   *  because they're boilerplate (every post on the account has them).
   *  When you need the FULL set for filtering, use `tags`. */
  displayTags?: string[];
  views: number;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  engagementRate: number;
}

// ============ Platform Comparison ============

export interface PlatformComparison {
  platform: Platform;
  accountName: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalImpressions: number;
  engagementRate: number;
  totalPosts: number;
  totalFollowers: number;
  followerGrowth: number;
}

// ============ Sync ============

export interface SyncLogResponse {
  id: string;
  socialAccountId: string;
  syncType: string;
  status: SyncStatus;
  errorMessage: string | null;
  postsSynced: number;
  metricsSynced: number;
  startedAt: string;
  completedAt: string | null;
}

// ============ Date Range ============

export interface DateRange {
  startDate: string;
  endDate: string;
}

// ============ Filters ============

export interface DashboardFilters {
  dateRange: DateRange;
  platforms: Platform[];
  contentFilter: ContentFilter;
}
