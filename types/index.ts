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
  createdAt: string;
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
