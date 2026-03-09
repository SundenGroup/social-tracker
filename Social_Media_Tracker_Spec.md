# Social Media Performance Tracker - Product Spec & Build Plan

## Executive Summary

The Social Media Performance Tracker is a web-based analytics platform designed to automate the collection, aggregation, and visualization of performance metrics across YouTube, X/Twitter, Instagram, and TikTok for PUBG Esports social media management.

Current state: Manually scraped data exists (612 YouTube Shorts, 655 X posts, 1200 Instagram posts, 630 TikTok videos). The tool will automate ongoing tracking and enable historical data import.

**Tech Stack**: Next.js 14+ (App Router), PostgreSQL, NextAuth.js, Playwright (for scraping), DigitalOcean (App Platform or Droplets)

**Data Collection**: YouTube uses Data API v3 (free tier). X/Twitter and TikTok use Playwright-based web scraping (no paid API tiers required). Instagram uses Graph API with scraping fallback. All platforms support a decaying-frequency metric refresh strategy to capture ongoing view accumulation on older posts.

**Timeline**: 8 phases, ~12-16 weeks for full implementation with optimal resource allocation

---

# PART 1: PRODUCT SPECIFICATION

## 1.0 Visual Identity (Clutch Group Brand Guidelines)

The Social Media Performance Tracker must follow the **Clutch Group Visual Identity 2024** guidelines and be visually consistent with the existing **Clutch Viewership Tracker**. Both tools should feel like part of the same product suite.

### Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Accent Red | `#FF154D` | Primary accent — CTAs, active states, hover effects, important alerts, accent bars/dividers |
| Accent Blue | `#121B6C` | Secondary accent — links, secondary buttons, chart lines, data highlights |
| Black | `#05090E` | Primary text, headings, sidebar background, navbar |
| Grey | `#1F2328` | Secondary text, card backgrounds (dark mode), borders |
| White | `#EBEFF4` | Page backgrounds, card backgrounds, light text on dark surfaces |

**Dashboard Application:**
- Sidebar: Black (`#05090E`) background with white (`#EBEFF4`) text and Accent Red (`#FF154D`) for the active navigation item indicator
- KPI Cards: White (`#EBEFF4`) background with Black (`#05090E`) text; trend indicators use Accent Red for positive metrics
- Charts: Use Accent Red as primary chart color, Accent Blue as secondary, Grey for tertiary/background elements
- Buttons: Primary buttons use Accent Red (`#FF154D`) with white text; secondary buttons use Accent Blue (`#121B6C`) with white text
- Table headers: Black (`#05090E`) or Grey (`#1F2328`) background with white text
- Accent dividers/bars: Short red bars (`#FF154D`) used as section dividers (consistent with brand guide pattern)

### Typography

**Font Family:** DM Sans (Google Fonts — free, open source)

| Weight | Usage |
|--------|-------|
| DM Sans Regular (400) | Body text, table cells, descriptions |
| DM Sans Medium (500) | Labels, navigation items, form labels, subtle emphasis |
| DM Sans Extra Bold (800) | Headings (H1, H2, H3), page titles, KPI values, large numbers |

**Import:** `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;800&display=swap');`

### Icons

**Icon Library:** Iconoir (https://iconoir.com/)

- Open source, free to use
- Stroke weight: 1.6px (per brand guidelines)
- Use for navigation items, platform indicators, action buttons, status indicators
- Install via: `npm install iconoir-react`

### Logo

**Clutch Group "C" Mark** — Abstract representation of the letter C

- **Sidebar header:** White horizontal version of the combination mark (C symbol + "Clutch Group" text)
- **Favicon/browser tab:** C brand mark only (no text)
- **Login page:** Black horizontal version centered above login form
- **Loading states:** C brand mark as spinner/pulse animation

Logo files provided: Dark version (for light backgrounds) and White version (for dark backgrounds). Both horizontal layout.

**Clear space:** Minimum 2x the height of the C symbol on all sides (per brand guidelines).

### Design Principles for Dashboard UI

1. **Dark sidebar, light content area** — Consistent with the Clutch website and Viewership Tracker
2. **Accent Red sparingly** — Use for CTAs, active states, and emphasis only. Not for large background areas.
3. **Clean, minimal layout** — Generous whitespace, clear visual hierarchy using DM Sans weight variations
4. **Red accent bars** — Short horizontal red bars (`#FF154D`) used as section dividers (signature Clutch brand element visible throughout the brand guide)
5. **Consistency with Clutch Viewership Tracker** — Same sidebar layout, same color scheme, same typography. Users should feel they're using the same product suite.

---

## 1.1 Feature Overview & User Stories

### Admin User Stories
1. **Account Management**: Connect social media accounts via OAuth/API keys, manage permissions, add/remove accounts
2. **Dashboard Access**: View aggregated performance across all platforms in one place
3. **Data Settings**: Configure content filters (all/video only per account), set sync frequency, manage scraping/API credentials
4. **User Management**: Create stakeholder accounts, assign read-only access, manage permissions
5. **Historical Data Import**: Bulk import pre-existing data from Excel files (612 YT Shorts, 655 X posts, 1200 IG posts, 630 TikTok videos)
6. **Export Data**: Generate CSV/Excel reports for any date range, per platform or cross-platform

### Viewer/Stakeholder User Stories
1. **View Dashboards**: See performance metrics on a read-only dashboard (no edit access)
2. **Export Reports**: Download CSV/Excel exports of metrics they have access to
3. **Date Filtering**: Filter metrics by date range, per platform
4. **Comparison Views**: Compare performance across platforms using unified metrics

---

## 1.2 Data Model

### Core Entities

#### Users (Authentication & Authorization)
```
users
├── id (UUID, PK)
├── email (VARCHAR, unique)
├── password_hash (VARCHAR, for NextAuth)
├── name (VARCHAR)
├── role (ENUM: admin, viewer)
├── organization_id (FK)
├── created_at (TIMESTAMP)
├── updated_at (TIMESTAMP)
├── is_active (BOOLEAN)
```

#### Organizations
```
organizations
├── id (UUID, PK)
├── name (VARCHAR, e.g., "PUBG Esports")
├── owner_id (FK → users.id)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Social Media Accounts
```
social_accounts
├── id (UUID, PK)
├── organization_id (FK)
├── platform (ENUM: youtube, twitter, instagram, tiktok)
├── account_id (VARCHAR, platform-specific ID, unique per platform)
├── account_name (VARCHAR, display name, e.g., "@PUBGEsports")
├── content_filter (ENUM: all, video_only)
├── is_active (BOOLEAN)
├── api_key / auth_token (encrypted VARCHAR, if using API)
├── last_synced_at (TIMESTAMP)
├── sync_status (ENUM: pending, syncing, success, failed)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)

Indexes:
- (organization_id, platform)
- (platform, account_id)
```

#### Posts/Content Items (unified across all platforms)
```
posts
├── id (UUID, PK)
├── social_account_id (FK)
├── platform (ENUM: youtube, twitter, instagram, tiktok) [denormalized for query speed]
├── post_id (VARCHAR, platform-specific ID)
├── post_type (ENUM: video, image, carousel, text, short, live) [platform-agnostic]
├── title (TEXT, nullable)
├── description (TEXT, nullable)
├── content_url (VARCHAR)
├── thumbnail_url (VARCHAR, nullable)
├── published_at (TIMESTAMP)
├── created_at (TIMESTAMP, when scraped)
├── updated_at (TIMESTAMP, last sync)
├── is_deleted (BOOLEAN, soft delete for platform removals)

Indexes:
- (social_account_id, published_at) [for time-range queries]
- (platform, published_at)
- (post_id, platform) [unique constraint equivalent]
```

#### Platform Metrics (Platform-Specific)
```
post_metrics
├── id (UUID, PK)
├── post_id (FK)
├── social_account_id (FK) [denormalized for aggregations]
├── platform (ENUM) [denormalized]
├── metric_date (DATE, snapshot date)
├── metric_type (ENUM: views, likes, comments, shares, impressions, reach, engagement_rate, etc.)
├── metric_value (BIGINT, numeric value)
├── recorded_at (TIMESTAMP, when metric was recorded)

Indexes:
- (post_id, metric_type, metric_date) [for time-series queries]
- (social_account_id, metric_type, metric_date) [for account aggregations]
- (social_account_id, metric_date) [for daily snapshots]

Constraints:
- UNIQUE (post_id, metric_type, metric_date) [prevent duplicate daily metrics]
```

#### Account-Level Daily Rollups (Aggregated)
```
account_daily_rollups
├── id (UUID, PK)
├── social_account_id (FK)
├── platform (ENUM)
├── rollup_date (DATE)
├── total_views (BIGINT)
├── total_likes (BIGINT)
├── total_comments (BIGINT)
├── total_shares (BIGINT)
├── total_impressions (BIGINT)
├── total_reach (BIGINT)
├── new_followers (BIGINT, delta)
├── total_followers (BIGINT, snapshot)
├── engagement_rate (NUMERIC)
├── posts_published (INT)
├── created_at (TIMESTAMP)

Indexes:
- (social_account_id, rollup_date) [for dashboard trends]
- (social_account_id, platform, rollup_date)
```

#### Sync Logs (Audit & Troubleshooting)
```
sync_logs
├── id (UUID, PK)
├── social_account_id (FK)
├── sync_type (ENUM: initial_full_sync, daily_update, manual_trigger)
├── status (ENUM: pending, in_progress, success, failed)
├── error_message (TEXT, nullable)
├── posts_synced (INT)
├── metrics_synced (INT)
├── started_at (TIMESTAMP)
├── completed_at (TIMESTAMP)
├── created_at (TIMESTAMP)

Indexes:
- (social_account_id, created_at)
- (status, created_at)
```

#### Imports (Historical Data)
```
data_imports
├── id (UUID, PK)
├── organization_id (FK)
├── file_name (VARCHAR)
├── file_size (BIGINT)
├── platform (ENUM, or NULL for multi-platform)
├── status (ENUM: pending, processing, success, failed, partial)
├── error_details (TEXT, nullable)
├── rows_attempted (INT)
├── rows_successful (INT)
├── created_by_user_id (FK)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

---

## 1.3 Platform-Specific Metrics

### YouTube Metrics (Per Video)
- **Views**: Total video views
- **Average View Duration**: Minutes/seconds watched per view
- **Engagement Rate**: (Likes + Comments) / Views
- **Click-Through Rate (CTR)**: Clicks to external links / Impressions
- **Impressions**: Times thumbnail shown
- **Likes**: Thumbs up count
- **Comments**: Total comments
- **Shares**: Share count (if available)
- **Subscribers**: Channel subscriber count at time of snapshot
- **Watch Hours**: Total hours watched for video

**YouTube-Specific**: Shorts vs. Regular Videos tracked separately; Live streams as distinct content type

### X/Twitter Metrics (Per Tweet/Post)
- **Views**: Total post views (primary metric for video posts)
- **Impressions**: Times tweet appeared in a feed (primary metric for text/image posts)
- **Engagements**: Total interactions (likes, retweets, replies, shares)
- **Engagement Rate**: Engagements / Views or Impressions (depending on post type)
- **Likes**: Favorite count
- **Retweets**: Retweet count
- **Replies**: Reply count
- **Quotes**: Quote tweet count
- **Bookmarks**: Bookmark count (if available)
- **Followers**: Account follower count at snapshot

**X-Specific**: Video posts use **Views** as primary metric; text/image posts use **Impressions** as primary metric. Dashboard should display the appropriate primary metric based on post type.

### Instagram Metrics (Per Post)
- **Views**: Total video/reel views (primary metric for video content)
- **Impressions**: Times post was seen (primary metric for static image posts)
- **Reach**: Unique accounts that saw post
- **Engagement Rate**: (Likes + Comments) / Views or Reach (depending on post type)
- **Likes**: Total likes
- **Comments**: Total comments
- **Saves**: Save count
- **Shares**: Share count
- **Followers**: Account follower count at snapshot
- **Profile Visits**: (if accessible via API)

**Instagram-Specific**: Carousel vs. Reels vs. Static Image tracked separately. Reels and video posts use **Views** as primary metric; static image posts and carousels use **Impressions/Reach** as primary metric.

### TikTok Metrics (Per Video)
- **Views**: Total video views
- **Engagement Rate**: (Likes + Comments + Shares) / Views
- **Likes**: Total likes
- **Comments**: Total comments
- **Shares**: Total shares
- **Favorites**: Save/favorite count
- **Watch Time**: Total seconds watched (if available)
- **Followers**: Account follower count at snapshot
- **Video Completion Rate**: Watch time / Duration (if calculable)

---

## 1.4 Cross-Platform Unified Metrics

For dashboards comparing across platforms:

1. **Total Views/Impressions**: Comparable metric (normalized). For video content, use Views; for non-video content, use Impressions.
2. **Engagement**: Likes + Comments + Shares (unified count)
3. **Engagement Rate**: Engagement / Views or Impressions (normalized %)
4. **Reach/Unique Users**: Where available (YouTube reach ≈ views, Twitter impressions, IG reach)
5. **Growth**: Follower changes across all platforms
6. **Average Post Performance**: Views/Impressions per post by platform

### Video vs. Non-Video Content Metrics

The system distinguishes between video and non-video content across all platforms:

**Video Content** (YouTube videos/shorts/live, X video posts, Instagram Reels, TikTok videos):
- Primary metric: **Views** (total video views)
- Secondary metrics: Likes, Comments, Shares, Watch Duration (where available)
- Engagement Rate = Engagements / Views

**Non-Video Content** (X text/image posts, Instagram static images/carousels):
- Primary metric: **Impressions** or **Reach**
- Secondary metrics: Likes, Comments, Shares, Saves
- Engagement Rate = Engagements / Impressions or Reach

Dashboards automatically switch between Views and Impressions as the primary metric column based on the content type being viewed. When the "Video Only" filter is active, Views is always the primary metric.

**Important**: Chart notes will clarify that metrics are platform-dependent and not perfectly apples-to-apples.

---

## 1.5 Dashboard Views

### Admin Dashboard (Home Page)
1. **Key Performance Indicators Card** (Top section)
   - Total Views/Impressions (last 7 days)
   - Total Engagements (last 7 days)
   - Combined Engagement Rate (last 7 days)
   - New Followers (delta, last 7 days)

2. **Platform Performance Tiles** (4 columns: YouTube, X, Instagram, TikTok)
   - Each shows: Total Views, Engagement Count, Top Post (by views)
   - Link to platform-specific dashboard

3. **Content Performance Table**
   - Columns: Platform, Post Title, Post Type, Views/Impressions (context-aware), Engagement, Date
   - **Content Type Filter**: Toggle between "All Content" and "Video Only" — when "Video Only" is active, primary metric column shows Views, non-video posts are hidden
   - Sortable by any column
   - Date range filter (default: last 30 days)
   - Pagination (20 rows/page)

4. **Weekly Trend Chart** (Line chart)
   - X-axis: Week
   - Y-axis: Combined Views/Impressions
   - One line per platform (or combined)
   - Hover to see exact values

5. **Account Health Status** (Small section)
   - Last sync time per platform
   - Next scheduled sync
   - Sync status (green/yellow/red)

### Per-Platform Dashboards

#### YouTube Dashboard
1. **KPI Cards**: Total Views, Avg Watch Duration, Avg Engagement Rate, Subscribers (current), Total Watch Hours
2. **Content Type Breakdown**: 
   - Tabs for "All", "Shorts", "Regular Videos", "Live Streams"
   - Count and avg metrics per type
3. **Video Performance Table**:
   - Columns: Title, Type, Published Date, Views, Avg Duration, Engagement Rate, Comments
   - Filterable by type, sortable
4. **Trends Chart** (Multi-metric line chart)
   - Views over time
   - Comments over time
   - Engagement rate over time
5. **Top Videos** (Table)
   - Ranking by views, likes, duration, comments
   - Switchable metric
6. **Subscriber Growth** (Line chart)
   - Subscriber count over time

#### X/Twitter Dashboard
1. **KPI Cards**: Total Views (video posts), Total Impressions (all posts), Avg Engagement Rate, Total Engagements, Followers (current)
2. **Content Type Filter**: Toggle between "All Content" and "Video Only" — filters the entire dashboard
3. **Engagement Breakdown Pie Chart**:
   - Likes vs. Retweets vs. Replies vs. Quotes
4. **Tweet Performance Table**:
   - Columns: Tweet Text (truncated), Post Type (video/image/text), Published Date, Views/Impressions (context-aware based on post type), Engagements, Likes, Retweets, Replies
   - When "Video Only" filter active: Shows only video posts, primary metric column = Views
   - Filterable, sortable
5. **Views/Impressions vs. Engagement** (Scatter plot or paired line chart)
   - Shows correlation between views (video) or impressions (other) and actual engagements
6. **Top Tweets** (Table)
   - By views (video), impressions (other), engagements, likes
7. **Follower Growth** (Line chart)
   - Follower count over time

#### Instagram Dashboard
1. **KPI Cards**: Total Views (Reels/video), Total Reach (all), Avg Engagement Rate, Total Engagements, Followers (current)
2. **Content Type Filter**: Toggle between "All Content" and "Video Only" (Reels) — filters the entire dashboard
3. **Content Type Breakdown**:
   - Tabs for "All", "Reels", "Posts", "Carousels"
   - Count and avg metrics per type
4. **Post Performance Table**:
   - Columns: Thumbnail, Caption (truncated), Type, Published Date, Views/Reach (context-aware: Views for Reels, Reach for images), Impressions, Engagement Rate, Saves
   - When "Video Only" filter active: Shows only Reels, primary metric = Views
5. **Reach vs. Impressions** (Line chart)
   - Two lines showing spread between reach and impressions
6. **Top Posts** (Image gallery view, sortable)
   - Click on post to see detailed metrics
7. **Follower Growth** (Line chart)

#### TikTok Dashboard
1. **KPI Cards**: Total Views, Avg Engagement Rate, Total Engagements, Followers (current)
2. **Video Performance Table**:
   - Columns: Thumbnail, Title, Published Date, Views, Watch Time, Engagement Rate, Completion Rate
3. **Views & Engagement** (Paired line chart)
   - Views over time
   - Engagement over time
4. **Top Videos** (Grid view with thumbnails)
   - Clickable for detailed metrics
5. **Watch Time Distribution** (Histogram or bar chart)
   - Shows distribution of watch times across videos
6. **Follower Growth** (Line chart)

### Cross-Platform Comparison Dashboard
1. **Platform Comparison Table**:
   - Rows: YouTube, X, Instagram, TikTok
   - Columns: Total Views/Impressions, Engagement Count, Engagement Rate, Followers, Date Range
   - Normalized note explaining metrics differences

2. **Views Trend (All Platforms)** (Line chart with 4 lines)
   - Allows toggling platforms on/off
   - Normalized or raw (switchable)

3. **Engagement Distribution Pie** (Across all platforms)
   - Shows which platform drives most engagement

4. **Growth Comparison** (Bar chart)
   - Follower growth by platform (last 30 days)

5. **Content Volume** (Bar chart)
   - Posts published per platform (last 30 days)

### Stakeholder/Viewer Dashboard
- Same as Admin Dashboard, but **read-only**
- No account management, settings, or user management access
- Export buttons available
- Filters work, but can't change settings

---

## 1.6 Role & Permission Model

### Role: Admin
**Permissions:**
- View all dashboards
- Create/edit/delete social accounts
- Configure content filters and sync settings
- View and manage sync logs
- Manage users (create viewer accounts)
- Import historical data
- Export data (CSV/Excel)
- View all analytics/metrics

**Scope**: Full access to organization data

### Role: Viewer/Stakeholder
**Permissions:**
- View dashboards (read-only)
- Export data (CSV/Excel) from dashboards
- Filter and search metrics
- Cannot: Create accounts, change settings, manage users, delete data

**Scope**: Read-only access to organization data

### Access Control Implementation
- NextAuth.js for authentication
- Session-based role checking in API routes
- Middleware to verify role before data access
- API endpoints return only data relevant to user's role

---

## 1.7 Import/Export Capabilities

### Import Historical Data
**Supported Format**: Excel (.xlsx) with columns:
- Platform (YouTube, Twitter, Instagram, TikTok)
- Post ID (platform-specific)
- Post Title
- Post Type (video, image, carousel, etc.)
- Published Date
- Views / Impressions
- Engagement Metrics (likes, comments, shares, etc.)

**Process:**
1. Admin uploads .xlsx file via UI
2. System parses and validates rows
3. Creates posts and post_metrics records
4. Returns success count + errors
5. Logs import in data_imports table

**Validation:**
- Post ID uniqueness per platform
- Date format checking
- Numeric metrics validation
- Duplicate detection (skip if post_id already exists)

### Export Data
**Formats**: CSV, Excel (.xlsx)

**Scopes:**
1. **Per-Platform Export**: All posts + metrics for one platform, date range
2. **Cross-Platform Summary**: Daily rollup summary across all platforms
3. **Custom Export**: Select specific platforms, date range, metrics

**Columns** (vary by export type):
- Post ID, Title, Published Date
- Views, Likes, Comments, Shares, Impressions, Reach, Engagement Rate
- Account Name, Platform
- Engagement Count, Engagement Rate, Watch Duration (YouTube)

---

# PART 2: TECHNICAL ARCHITECTURE

## 2.1 Next.js App Structure (App Router)

```
social-media-tracker/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── [...nextauth]/
│   │   │   │   └── route.ts          [NextAuth configuration]
│   │   │   ├── register/
│   │   │   │   └── route.ts          [User registration]
│   │   │   └── logout/
│   │   │       └── route.ts          [Logout endpoint]
│   │   ├── accounts/
│   │   │   ├── route.ts              [GET all, POST create accounts]
│   │   │   ├── [id]/
│   │   │   │   ├── route.ts          [GET, PUT, DELETE single account]
│   │   │   │   ├── sync/
│   │   │   │   │   └── route.ts      [POST manual sync trigger]
│   │   │   │   └── credentials/
│   │   │   │       └── route.ts      [PUT update API keys]
│   │   │   └── test-connection/
│   │   │       └── route.ts          [POST verify API connection]
│   │   ├── posts/
│   │   │   ├── route.ts              [GET posts with filters]
│   │   │   ├── import/
│   │   │   │   └── route.ts          [POST import historical data]
│   │   │   └── [id]/
│   │   │       └── metrics/
│   │   │           └── route.ts      [GET post metrics]
│   │   ├── metrics/
│   │   │   ├── daily-rollups/
│   │   │   │   └── route.ts          [GET aggregated daily metrics]
│   │   │   ├── platform/
│   │   │   │   ├── youtube/
│   │   │   │   │   └── route.ts      [GET YouTube-specific metrics]
│   │   │   │   ├── twitter/
│   │   │   │   │   └── route.ts      [GET Twitter-specific metrics]
│   │   │   │   ├── instagram/
│   │   │   │   │   └── route.ts      [GET Instagram-specific metrics]
│   │   │   │   └── tiktok/
│   │   │   │       └── route.ts      [GET TikTok-specific metrics]
│   │   │   └── comparison/
│   │   │       └── route.ts          [GET cross-platform comparison]
│   │   ├── users/
│   │   │   ├── route.ts              [GET all, POST create users]
│   │   │   └── [id]/
│   │   │       └── route.ts          [GET, PUT, DELETE user]
│   │   ├── exports/
│   │   │   ├── csv/
│   │   │   │   └── route.ts          [POST generate CSV, return file]
│   │   │   └── xlsx/
│   │   │       └── route.ts          [POST generate Excel, return file]
│   │   ├── sync-logs/
│   │   │   └── route.ts              [GET sync history]
│   │   └── health/
│   │       └── route.ts              [GET system health status]
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx              [Login page]
│   │   ├── register/
│   │   │   └── page.tsx              [Registration page]
│   │   └── layout.tsx                [Auth layout wrapper]
│   ├── (dashboard)/
│   │   ├── layout.tsx                [Dashboard layout with sidebar]
│   │   ├── page.tsx                  [Admin home/overview dashboard]
│   │   ├── accounts/
│   │   │   ├── page.tsx              [Account management page]
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx          [Account detail/edit page]
│   │   │   └── new/
│   │   │       └── page.tsx          [Create new account page]
│   │   ├── platforms/
│   │   │   ├── youtube/
│   │   │   │   └── page.tsx          [YouTube dashboard]
│   │   │   ├── twitter/
│   │   │   │   └── page.tsx          [X/Twitter dashboard]
│   │   │   ├── instagram/
│   │   │   │   └── page.tsx          [Instagram dashboard]
│   │   │   └── tiktok/
│   │   │       └── page.tsx          [TikTok dashboard]
│   │   ├── comparison/
│   │   │   └── page.tsx              [Cross-platform comparison]
│   │   ├── import/
│   │   │   └── page.tsx              [Historical data import]
│   │   ├── users/
│   │   │   ├── page.tsx              [User management page]
│   │   │   └── [id]/
│   │   │       └── page.tsx          [Edit user page]
│   │   └── settings/
│   │       └── page.tsx              [Organization settings]
│   ├── error.tsx                     [Global error page]
│   ├── not-found.tsx                 [404 page]
│   └── layout.tsx                    [Root layout]
├── lib/
│   ├── db.ts                         [Prisma client initialization]
│   ├── auth.ts                       [NextAuth configuration]
│   ├── api-keys.ts                   [Encryption/decryption for API credentials]
│   ├── validators.ts                 [Zod schemas for input validation]
│   ├── errors.ts                     [Custom error classes]
│   ├── utils/
│   │   ├── date.ts                   [Date formatting, range calculations]
│   │   ├── metrics.ts                [Metric calculations, aggregations]
│   │   ├── export.ts                 [CSV/Excel generation]
│   │   └── normalization.ts          [Cross-platform metric normalization]
│   └── collectors/
│       ├── base-collector.ts         [Abstract base class for collectors]
│       ├── youtube.ts                [YouTube Data API collector]
│       ├── twitter.ts                [X/Twitter API v2 collector]
│       ├── instagram.ts              [Instagram Graph API collector]
│       └── tiktok.ts                 [TikTok collector (API + scraping)]
├── components/
│   ├── layouts/
│   │   ├── DashboardLayout.tsx       [Main dashboard wrapper]
│   │   ├── AuthLayout.tsx            [Auth page wrapper]
│   │   └── Sidebar.tsx               [Navigation sidebar]
│   ├── dashboards/
│   │   ├── AdminOverview.tsx         [Home dashboard]
│   │   ├── PlatformDashboard.tsx     [Generic platform template]
│   │   ├── YouTubeDashboard.tsx      [YouTube-specific dashboard]
│   │   ├── TwitterDashboard.tsx      [X/Twitter-specific dashboard]
│   │   ├── InstagramDashboard.tsx    [Instagram-specific dashboard]
│   │   ├── TikTokDashboard.tsx       [TikTok-specific dashboard]
│   │   └── ComparisonDashboard.tsx   [Cross-platform comparison]
│   ├── charts/
│   │   ├── LineChart.tsx             [Recharts line chart wrapper]
│   │   ├── BarChart.tsx              [Recharts bar chart wrapper]
│   │   ├── PieChart.tsx              [Recharts pie chart wrapper]
│   │   ├── ScatterPlot.tsx           [Recharts scatter wrapper]
│   │   └── HistogramChart.tsx        [Custom histogram]
│   ├── tables/
│   │   ├── DataTable.tsx             [Reusable table with sorting/filtering]
│   │   ├── PostPerformanceTable.tsx  [Post listing table]
│   │   ├── MetricsTable.tsx          [Metrics summary table]
│   │   └── SyncLogsTable.tsx         [Sync history table]
│   ├── cards/
│   │   ├── KPICard.tsx               [Metric display card]
│   │   ├── AccountCard.tsx           [Account tile/card]
│   │   ├── PostCard.tsx              [Post preview card]
│   │   └── StatusCard.tsx            [Health/status card]
│   ├── forms/
│   │   ├── AccountForm.tsx           [Create/edit social account]
│   │   ├── UserForm.tsx              [Create/edit user]
│   │   ├── ImportForm.tsx            [Upload historical data]
│   │   └── FilterForm.tsx            [Date range, platform filters]
│   ├── modals/
│   │   ├── ConfirmModal.tsx          [Confirmation dialog]
│   │   ├── SyncModal.tsx             [Manual sync trigger]
│   │   └── ExportModal.tsx           [Export options]
│   ├── common/
│   │   ├── Header.tsx                [Top navigation bar]
│   │   ├── Footer.tsx                [Footer]
│   │   ├── LoadingSpinner.tsx        [Loading indicator]
│   │   ├── ErrorBoundary.tsx         [Error boundary]
│   │   └── Toast.tsx                 [Toast notifications]
│   └── auth/
│       ├── LoginForm.tsx             [Login form]
│       ├── RegisterForm.tsx          [Registration form]
│       └── ProtectedRoute.tsx        [Client-side route protection]
├── styles/
│   ├── globals.css                   [Global Tailwind CSS + DM Sans import + Clutch brand CSS variables]
│   ├── variables.css                 [CSS variables for Clutch colors: --clutch-red, --clutch-blue, etc.]
│   └── components/                   [Component-specific styles]
├── hooks/
│   ├── useAuth.ts                    [Hook to access current user/session]
│   ├── useMetrics.ts                 [Hook to fetch metrics data]
│   ├── usePosts.ts                   [Hook to fetch posts]
│   ├── useAccounts.ts                [Hook to fetch social accounts]
│   └── useExport.ts                  [Hook for export functionality]
├── workers/
│   ├── sync-worker.ts                [Main sync orchestrator]
│   ├── youtube-sync.ts               [YouTube sync job]
│   ├── twitter-sync.ts               [X/Twitter sync job]
│   ├── instagram-sync.ts             [Instagram sync job]
│   └── tiktok-sync.ts                [TikTok sync job]
├── tasks/
│   ├── cron-jobs.ts                  [Cron job definitions for background sync]
│   └── queue-config.ts               [Job queue configuration (Bull/RabbitMQ)]
├── prisma/
│   └── schema.prisma                 [Prisma ORM schema]
├── public/
│   ├── logos/                        [Platform logos]
│   └── images/                       [App images]
├── .env.local                        [Environment variables (not in repo)]
├── .env.example                      [Environment variable template]
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── next.config.js
└── README.md
```

---

## 2.2 PostgreSQL Schema Design

### Schema File (Prisma schema.prisma)

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ============ ENUMS ============
enum Platform {
  youtube
  twitter
  instagram
  tiktok
}

enum UserRole {
  admin
  viewer
}

enum ContentFilter {
  all
  video_only
}

enum SyncStatus {
  pending
  syncing
  success
  failed
}

enum DataImportStatus {
  pending
  processing
  success
  failed
  partial
}

enum SyncType {
  initial_full_sync
  daily_update
  manual_trigger
}

enum PostType {
  video
  image
  carousel
  text
  short
  live
  story
}

enum MetricType {
  views
  impressions
  likes
  comments
  shares
  engagement_rate
  reach
  watch_duration
  ctr
  bookmarks
  followers
  profile_visits
}

// ============ MODELS ============

model Organization {
  id        String   @id @default(cuid())
  name      String
  ownerId   String
  owner     User     @relation("OrganizationOwner", fields: [ownerId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users          User[]
  socialAccounts SocialAccount[]
  dataImports    DataImport[]

  @@index([ownerId])
}

model User {
  id                String        @id @default(cuid())
  email             String        @unique
  passwordHash      String
  name              String
  role              UserRole      @default(viewer)
  organizationId    String
  organization      Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  isActive          Boolean       @default(true)
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  ownedOrganizations Organization[] @relation("OrganizationOwner")
  dataImports         DataImport[]

  @@index([organizationId])
  @@index([email])
}

model SocialAccount {
  id              String   @id @default(cuid())
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  platform        Platform
  accountId       String   // Platform-specific account ID (e.g., UCxxxxx for YouTube)
  accountName     String   // Display name
  contentFilter   ContentFilter @default(all)
  isActive        Boolean  @default(true)
  
  // API/Auth credentials (encrypted)
  apiKey          String?  // Encrypted API key or token
  authToken       String?  // Encrypted OAuth token
  refreshToken    String?  // Encrypted refresh token
  
  // Sync metadata
  lastSyncedAt    DateTime?
  syncStatus      SyncStatus @default(pending)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  posts           Post[]
  postMetrics     PostMetric[]
  dailyRollups    AccountDailyRollup[]
  syncLogs        SyncLog[]

  @@unique([organizationId, platform, accountId])
  @@index([organizationId, platform])
  @@index([platform, accountId])
}

model Post {
  id              String   @id @default(cuid())
  socialAccountId String
  socialAccount   SocialAccount @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)
  platform        Platform
  postId          String   // Platform-specific post ID
  postType        PostType
  
  title           String?
  description     String?
  contentUrl      String
  thumbnailUrl    String?
  
  publishedAt           DateTime
  lastMetricRefreshAt   DateTime?  // When metrics were last re-fetched (for decaying refresh)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  isDeleted             Boolean  @default(false)
  isTrending            Boolean  @default(false)  // Flagged when metrics spike unexpectedly

  metrics         PostMetric[]

  @@unique([socialAccountId, postId])
  @@index([socialAccountId, publishedAt])
  @@index([platform, publishedAt])
  @@index([lastMetricRefreshAt])  // For finding posts due for metric refresh
}

model PostMetric {
  id              String   @id @default(cuid())
  postId          String
  post            Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  socialAccountId String
  socialAccount   SocialAccount @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)
  platform        Platform
  
  metricDate      DateTime @db.Date
  metricType      MetricType
  metricValue     BigInt
  recordedAt      DateTime @default(now())

  @@unique([postId, metricType, metricDate])
  @@index([postId, metricType, metricDate])
  @@index([socialAccountId, metricType, metricDate])
  @@index([socialAccountId, metricDate])
}

model AccountDailyRollup {
  id              String   @id @default(cuid())
  socialAccountId String
  socialAccount   SocialAccount @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)
  platform        Platform
  
  rollupDate      DateTime @db.Date
  
  totalViews      BigInt   @default(0)
  totalLikes      BigInt   @default(0)
  totalComments   BigInt   @default(0)
  totalShares     BigInt   @default(0)
  totalImpressions BigInt  @default(0)
  totalReach      BigInt   @default(0)
  newFollowers    BigInt   @default(0)
  totalFollowers  BigInt   @default(0)
  engagementRate  Float    @default(0.0)
  postsPublished  Int      @default(0)
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([socialAccountId, rollupDate])
  @@index([socialAccountId, rollupDate])
  @@index([socialAccountId, platform, rollupDate])
}

model SyncLog {
  id              String   @id @default(cuid())
  socialAccountId String
  socialAccount   SocialAccount @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)
  
  syncType        SyncType
  status          SyncStatus @default(pending)
  errorMessage    String?
  
  postsSynced     Int      @default(0)
  metricsSynced   Int      @default(0)
  
  startedAt       DateTime
  completedAt     DateTime?
  createdAt       DateTime @default(now())

  @@index([socialAccountId, createdAt])
  @@index([status, createdAt])
}

model DataImport {
  id              String   @id @default(cuid())
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  
  fileName        String
  fileSize        BigInt
  platform        Platform?  // NULL for multi-platform imports
  
  status          DataImportStatus @default(pending)
  errorDetails    String?
  
  rowsAttempted   Int      @default(0)
  rowsSuccessful  Int      @default(0)
  
  createdById     String
  createdBy       User     @relation(fields: [createdById], references: [id])
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([organizationId, createdAt])
  @@index([status, createdAt])
}

// Session/NextAuth models (auto-generated by NextAuth)
model Account {
  id                 String  @id @default(cuid())
  userId             String
  type               String
  provider           String
  providerAccountId  String
  refresh_token      String?  @db.Text
  access_token       String?  @db.Text
  expires_at         Int?
  token_type         String?
  scope              String?
  id_token           String?  @db.Text
  session_state      String?

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

### Database Indexes Summary

**High-Priority Indexes**:
1. `Post(socialAccountId, publishedAt)` - Dashboard time-range queries
2. `PostMetric(postId, metricType, metricDate)` - Metric lookups
3. `PostMetric(socialAccountId, metricType, metricDate)` - Account aggregations
4. `AccountDailyRollup(socialAccountId, rollupDate)` - Rollup queries
5. `SocialAccount(organizationId, platform)` - Account lookups
6. `User(organizationId)` - User lookups per org

---

## 2.3 API Route Design

### Authentication Routes

**POST /api/auth/register**
- Input: { email, password, name }
- Output: { user, token }
- Validation: Email format, password strength

**POST /api/auth/login** (via NextAuth)
- Input: { email, password }
- Output: Session cookie

**POST /api/auth/logout** (via NextAuth)
- Output: Redirect to login

### Account Management Routes

**GET /api/accounts**
- Query: `organizationId` (required for admins), `platform` (optional filter)
- Output: `{ accounts: SocialAccount[] }`
- Auth: Admin role required

**POST /api/accounts**
- Body: { platform, accountId, accountName, contentFilter, apiKey/authToken }
- Output: { account: SocialAccount }
- Auth: Admin role required
- Side effect: Validate credentials with platform API

**GET /api/accounts/[id]**
- Output: { account: SocialAccount }
- Auth: User from same organization

**PUT /api/accounts/[id]**
- Body: { contentFilter, apiKey?, authToken?, isActive }
- Output: { account: SocialAccount }
- Auth: Admin role required

**DELETE /api/accounts/[id]**
- Output: { success: boolean }
- Auth: Admin role required
- Side effect: Soft-delete posts (set isDeleted=true)

**POST /api/accounts/[id]/sync**
- Query: `force=true` (optional, skip throttling)
- Output: { syncLog: SyncLog, status: 'queued' }
- Auth: Admin role required
- Side effect: Add job to sync queue

**POST /api/accounts/test-connection**
- Body: { platform, apiKey/authToken, accountId }
- Output: { valid: boolean, error?: string }
- Auth: Admin role required
- Side effect: None (read-only test)

### Post & Metrics Routes

**GET /api/posts**
- Query: `accountId`, `platform`, `startDate`, `endDate`, `limit`, `offset`
- Output: { posts: Post[], total: number, hasMore: boolean }
- Auth: User from same organization

**GET /api/posts/[id]/metrics**
- Query: `startDate`, `endDate`
- Output: { metrics: PostMetric[], post: Post }
- Auth: User from same organization

**GET /api/metrics/daily-rollups**
- Query: `accountId`, `startDate`, `endDate`
- Output: { rollups: AccountDailyRollup[] }
- Auth: User from same organization

**GET /api/metrics/platform/youtube**
- Query: `accountId`, `startDate`, `endDate`, `contentType` (all|shorts|regular|live)
- Output: { posts, metrics, summary: { totalViews, avgWatchDuration, ... } }
- Auth: User from same organization

**GET /api/metrics/platform/twitter**
- Query: `accountId`, `startDate`, `endDate`, `contentType` (all|video_only)
- Output: { posts, metrics, summary: { totalViews, totalImpressions, avgEngagementRate, ... } }
- Auth: User from same organization
- Note: When `contentType=video_only`, only video posts are returned and totalViews is the primary metric

**GET /api/metrics/platform/instagram**
- Query: `accountId`, `startDate`, `endDate`, `contentType` (all|video_only|reels|posts|carousels)
- Output: { posts, metrics, summary: { totalViews, totalReach, avgEngagementRate, ... } }
- Auth: User from same organization
- Note: When `contentType=video_only` or `contentType=reels`, Views is the primary metric

**GET /api/metrics/platform/tiktok**
- Query: `accountId`, `startDate`, `endDate`
- Output: { posts, metrics, summary: { totalViews, avgEngagementRate, ... } }
- Auth: User from same organization

**GET /api/metrics/comparison**
- Query: `startDate`, `endDate`, `normalized=true` (normalize metrics across platforms)
- Output: { summary: { youtube: {...}, twitter: {...}, ... }, trend: [...] }
- Auth: User from same organization

### Import/Export Routes

**POST /api/posts/import**
- Body: FormData with .xlsx file
- Output: { importId, status, rowsAttempted, rowsSuccessful, errors: [] }
- Auth: Admin role required
- Side effect: Create DataImport record, parse file, insert Posts and PostMetrics

**POST /api/exports/csv**
- Body: { platform?, startDate, endDate, metrics: [] }
- Output: { fileUrl: string } (or direct file download)
- Auth: User from same organization

**POST /api/exports/xlsx**
- Body: { platform?, startDate, endDate, metrics: [] }
- Output: { fileUrl: string } (or direct file download)
- Auth: User from same organization

### User Management Routes (Admin only)

**GET /api/users**
- Query: `organizationId`
- Output: { users: User[] }
- Auth: Admin role required

**POST /api/users**
- Body: { email, name, role, organizationId }
- Output: { user: User }
- Auth: Admin role required
- Side effect: Send invitation email with temp password

**PUT /api/users/[id]**
- Body: { name, role, isActive }
- Output: { user: User }
- Auth: Admin role required (or user editing self, limited fields)

**DELETE /api/users/[id]**
- Output: { success: boolean }
- Auth: Admin role required
- Side effect: Soft-delete (set isActive=false)

### Sync Logs Route

**GET /api/sync-logs**
- Query: `accountId`, `status`, `startDate`, `endDate`, `limit`
- Output: { logs: SyncLog[] }
- Auth: User from same organization

### Health/Status Route

**GET /api/health**
- Output: { status: 'ok'|'error', database: boolean, workers: boolean }
- Auth: None (public, for monitoring)

---

## 2.4 Data Collection Architecture

### Sync Orchestrator (lib/workers/sync-worker.ts)

**Purpose**: Coordinate daily syncs across all platforms for all active accounts.

**Trigger**: 
- Cron job at 2 AM UTC daily (configurable)
- Manual trigger via `/api/accounts/[id]/sync` endpoint

**Flow**:
1. Fetch all active `SocialAccount` records
2. For each account:
   - Create `SyncLog` record with status='pending'
   - Enqueue sync job to job queue (Bull/RabbitMQ)
3. Each queued job:
   - Call platform-specific collector
   - Fetch new posts and update metrics
   - Update `SyncLog` with results
   - Update `SocialAccount.lastSyncedAt`

**Error Handling**:
- Retry failed syncs up to 3 times (exponential backoff)
- Log errors in `SyncLog.errorMessage`
- Mark account as `syncStatus='failed'` if all retries exhausted
- Send alert email to admin on repeated failures

**Concurrency**: Process up to 5 accounts simultaneously (configurable per DigitalOcean resources)

### Metric Refresh Strategy (Decaying Frequency)

Posts continue to accumulate views, likes, and engagement well beyond their publish date. A video on X or TikTok can go viral on day 9 or later. To capture this, the system uses a **decaying frequency refresh strategy** that re-fetches metrics for older posts at decreasing intervals:

**Refresh Schedule:**
- **Days 1–7** (after publish): Refresh metrics **daily** — most engagement happens in this window
- **Days 8–30**: Refresh metrics **every 3 days** — catches late-blooming and viral content
- **Days 31–90**: Refresh metrics **weekly** — catches long-tail engagement
- **90+ days**: Refresh metrics **monthly** or on-demand only

**Spike Detection:**
- After each metric refresh, compare new values to the previous snapshot
- If views or engagement jump by more than 50% since the last check, flag the post as "trending"
- Trending posts are temporarily promoted to daily refresh regardless of age
- Alert admin when a post is detected as trending

**Implementation:**
- Each `Post` record tracks `lastMetricRefreshAt` (timestamp of last metric fetch)
- The sync worker calculates which posts are due for refresh based on their `publishedAt` date and `lastMetricRefreshAt`
- Posts are grouped into priority buckets and processed in order: daily → every-3-days → weekly → monthly
- The system respects API rate limits by spreading refreshes across the day rather than batching them all at sync time

**Why this matters:**
Without metric refresh, the system would only capture metrics at the time of initial sync. A video posted on Day 1 with 500 views that goes viral on Day 9 reaching 500,000 views would forever show 500 views in the dashboard — making the data misleading and unreliable.

### Platform Collectors (lib/collectors/)

#### Base Collector (lib/collectors/base-collector.ts)

```typescript
abstract class BaseCollector {
  constructor(protected account: SocialAccount, protected prisma: PrismaClient) {}

  abstract fetchPosts(): Promise<PostData[]>
  abstract fetchMetrics(postId: string): Promise<MetricData[]>
  abstract getAccountStats(): Promise<AccountStats>

  async sync(): Promise<SyncResult> {
    // Generic sync flow:
    // 1. Fetch posts from API
    // 2. Insert/update posts in DB
    // 3. Fetch metrics for each post
    // 4. Upsert metrics in DB
    // 5. Calculate daily rollup
    // 6. Return result
  }

  protected validateCredentials(): Promise<boolean>
  protected handleRateLimit(error: any): Promise<void>
}
```

#### YouTube Collector (lib/collectors/youtube.ts)

**API**: YouTube Data API v3

**Authentication**: API Key or OAuth2 (server-to-server)

**Endpoints Used**:
- `youtube.search.list()` - Find all uploads from channel
- `youtube.videos.list()` - Get video details and stats
- `youtube.videos.list()` with `part=statistics` - Get views, likes, comments
- `youtube.videoAbuseReportReasons.list()` - Category info (optional)

**Content Types**: Regular videos, Shorts, Live streams

**Metrics Collected**:
- Views
- Likes
- Comments
- Shares (if available)
- Average view duration
- Watch hours
- Impressions (via YouTube Analytics, requires OAuth)
- Click-through rate (via YouTube Analytics)

**Collection Strategy**:
1. First sync: Paginate through all uploads (max 1000 results per API rules)
2. Daily sync: Fetch only videos published in last 3 days (optimization)
3. For each video: Fetch statistics endpoint
4. For YouTube Analytics (premium metrics): Use separate API, requires authentication

**Rate Limits**: 
- 10,000 units/day (free quota)
- 1-10 units per request
- Handle with exponential backoff + queuing

**Implementation Notes**:
- Use official `google-api-nodejs-client` package
- Separate collector for "Shorts" (postType=short)
- "Live" streams detected via `liveStatus` field

#### X/Twitter Collector (lib/collectors/twitter.ts)

**Approach**: Web scraping via Playwright (no paid API tier required)

**Why scraping instead of API**: X/Twitter's API v2 Basic tier costs $100/month and is limited to 10,000 tweet reads/month with a 7-day search window. The free tier is write-only. Since the tool only needs to monitor one account's public posts and metrics, browser-based scraping provides the same data at zero cost with no time-window limitations.

**Authentication**: Uses Playwright with a logged-in browser session (session cookies stored securely). Alternatively, can scrape public profile pages without authentication for basic metrics.

**Data Sources**:
- Profile page timeline: Scroll and extract post metadata
- Individual post pages: Extract detailed metrics (views, likes, retweets, replies, quotes, bookmarks)
- X's internal GraphQL API (TweetDetail endpoint): Accessible from authenticated browser sessions, returns full metrics including view counts

**Metrics Collected**:
- Views (from post analytics link or GraphQL response)
- Engagement count (likes + retweets + replies + quotes)
- Likes
- Retweets
- Replies
- Quotes
- Bookmarks
- Followers

**Collection Strategy**:
1. Open profile page in headless Playwright browser
2. Scroll to load recent posts, extract post IDs and basic metadata
3. For each post: Use GraphQL TweetDetail endpoint or visit individual post page to extract full metrics
4. Daily sync: Fetch new posts from profile timeline
5. Metric refresh: Re-visit older posts per the decaying frequency schedule to capture ongoing view accumulation

**Rate Limiting**:
- Implement respectful delays between requests (2-5 seconds)
- Rotate user agents
- Limit to ~100 post lookups per sync cycle
- Exponential backoff on rate limit responses (429)

**Implementation Notes**:
- Use Playwright for stable, headless browser automation
- Parse metrics from DOM elements (aria-labels on analytics links) or from GraphQL JSON responses
- Store session cookies securely (encrypted in DB)
- Handle page structure changes gracefully with fallback selectors
- Log scraping errors separately for manual review

**Optional API Upgrade**: If the team later decides to use X API v2 (Basic $100/mo or Pro $5,000/mo), the collector can be swapped to use the official API without changing the rest of the system. The BaseCollector pattern makes this a drop-in replacement.

#### Instagram Collector (lib/collectors/instagram.ts)

**Approach**: Hybrid — Instagram Graph API (primary) + Playwright scraping (fallback)

**Primary: Instagram Graph API**

**Authentication**: OAuth2 via Facebook Business Account

**Endpoints Used**:
- `GET /{page-id}/instagram_business_account` - Get IG account
- `GET /{ig-user-id}/media` - Get all posts
- `GET /{media-id}/insights` - Get post metrics (including video_views for Reels)
- `GET /{ig-user-id}/insights` - Get account metrics

**Metrics Collected**:
- Views (for Reels/video content — primary metric for video posts)
- Impressions (for static image posts — primary metric for non-video posts)
- Reach
- Likes
- Comments
- Saves
- Shares
- Profile visits
- Followers
- Engagement rate

**Content Types**: Reels, Feed Posts, Carousels, Stories (if available)

**Collection Strategy**:
1. Authenticate with Facebook Business account (OAuth2 flow in admin panel)
2. Get IG account ID
3. Fetch media list (paginated)
4. For each post: Fetch insights endpoint. For Reels/video, prioritize `video_views` metric; for images, use `impressions`
5. Daily sync: Fetch new posts and refresh metrics for older posts per decaying frequency schedule
6. Metric refresh: Re-fetch insights for older posts to capture ongoing view/engagement accumulation

**Fallback: Playwright Scraping**
- If Instagram Graph API is unavailable (no Facebook Business Account), use Playwright to scrape public profile pages
- Extract post metadata and basic metrics from page DOM
- Less detailed metrics but works without API access

**Rate Limits**:
- API: 200 calls per hour (per access token)
- Scraping: 2-5 second delay between requests
- Implement queue + rate limiting for both approaches

**Implementation Notes**:
- Requires Facebook Business Account setup for API approach
- Instagram API has stricter rate limiting
- Insights available for business/creator accounts only via API
- Scraping fallback available for basic metrics without API access

#### TikTok Collector (lib/collectors/tiktok.ts)

**Challenge**: TikTok official API is very limited. Two approaches:

**Option A: Official TikTok Research API** (Limited availability)
- Available for researchers, limited metrics
- Not suitable for production monitoring

**Option B: Unofficial Web Scraping** (Risk: ToS violation)
- Use Playwright or Puppeteer to scrape public video pages
- Extract metrics from page metadata
- More reliable but has legal/ToS risks

**Recommended Approach**: Hybrid
1. Use official API if available (apply for access)
2. Fallback to scraping for production
3. Implement respectful rate limiting (1 request per 2 seconds)
4. Rotate user agents + proxies to avoid detection

**Metrics Collected** (via scraping):
- View count
- Like count
- Comment count
- Share count
- Save/favorite count
- Follower count
- Video completion rate (estimated)

**Collection Strategy**:
1. Get TikTok account URL
2. Fetch recent videos from profile page (paginated)
3. For each video: Open video page, extract stats from metadata
4. Extract metrics from page HTML/JSON
5. Daily sync: Check last 10-20 videos for updates

**Implementation Notes**:
- Use Playwright for stable, headless scraping
- Parse metrics from `<script type="application/ld+json">` or API response
- Implement cooldown between requests (2-5 seconds)
- Log errors separately (account may require manual review)
- Consider using free TikTok API wrapper if available (e.g., TikTok-Api-Unofficial package)

---

## 2.5 Authentication (NextAuth.js)

**Setup**: NextAuth.js v5 (latest) with PostgreSQL adapter

**Configuration** (lib/auth.ts):

```typescript
import NextAuth, { type NextAuthConfig } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/db"

export const config: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Find user by email
        // Compare password hash (use bcrypt)
        // Return user object or null
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.organizationId = user.organizationId
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.organizationId = token.organizationId
      return session
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
}

export const { handlers, auth } = NextAuth(config)
```

**Password Security**:
- Hash passwords with bcrypt (cost factor: 12)
- Never store plain passwords
- Validate password strength on registration (min 8 chars, uppercase, lowercase, number, special char recommended)

**Session Management**:
- JWT-based sessions (stateless, scalable)
- 30-day expiration (refresh on login)
- Secure cookies (httpOnly, secure, sameSite=strict)

**Authorization Middleware**:

```typescript
// middleware.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function middleware(request: NextRequest) {
  const session = await auth()

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Check role-based access
  if (request.nextUrl.pathname.startsWith("/api/users")) {
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/:path*", "/(dashboard)/:path*"],
}
```

---

## 2.6 Deployment on DigitalOcean

### Option A: DigitalOcean App Platform (Recommended for beginners)

**Pros**:
- Fully managed (no server maintenance)
- Auto-scaling, SSL included
- GitHub integration for CI/CD
- Built-in PostgreSQL database

**Cons**:
- Limited customization
- Higher costs for background jobs
- No SSH access

**Setup Steps**:
1. Create DigitalOcean App
2. Connect GitHub repo
3. Configure environment (Node.js 18+)
4. Add PostgreSQL managed database
5. Set environment variables
6. Deploy on push to main branch
7. Set up cron job with external service (EasyCron, cron-job.org)

### Option B: DigitalOcean Droplet (More control)

**Pros**:
- Full control, lower cost
- Can run custom background jobs easily
- SSH access for debugging
- Full Node.js + PostgreSQL setup

**Cons**:
- Need to manage server, backups, updates
- Responsible for security hardening

**Setup Steps**:
1. Create Droplet (2GB RAM, 2vCPU recommended)
   - OS: Ubuntu 22.04 LTS
   - Size: $18/month (5GB SSD, 2GB RAM, 2vCPU)

2. Initial setup:
   ```bash
   # SSH into droplet
   ssh root@your_droplet_ip

   # Update system
   sudo apt update && sudo apt upgrade -y

   # Install Node.js 18+
   curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install nodejs -y

   # Install PostgreSQL
   sudo apt install postgresql postgresql-contrib -y

   # Create database and user
   sudo -u postgres createdb social_tracker
   sudo -u postgres createuser tracker_user
   sudo -u postgres psql -c "ALTER USER tracker_user WITH PASSWORD 'secure_password';"
   ```

3. Clone and setup application:
   ```bash
   cd /home/ubuntu
   git clone https://github.com/yourrepo/social-media-tracker.git
   cd social-media-tracker
   npm install
   npm run build
   ```

4. Environment variables (.env.local):
   ```
   DATABASE_URL="postgresql://tracker_user:secure_password@localhost:5432/social_tracker"
   NEXTAUTH_SECRET="generate with: openssl rand -base64 32"
   YOUTUBE_API_KEY="..."
   TWITTER_API_KEY="..."
   # ... other API keys
   ```

5. Setup PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start npm --name social-tracker -- start
   pm2 startup
   pm2 save
   ```

6. Setup Nginx as reverse proxy:
   ```bash
   sudo apt install nginx -y
   # Configure /etc/nginx/sites-available/default
   # Proxy to localhost:3000
   ```

7. Setup SSL with Certbot:
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d yourdomain.com
   ```

8. Setup cron job for daily sync:
   ```bash
   # In crontab -e
   0 2 * * * curl -X POST https://yourdomain.com/api/sync/trigger \
     -H "Authorization: Bearer CRON_SECRET_TOKEN" \
     -H "Content-Type: application/json"
   ```

9. Backups:
   ```bash
   # Enable DigitalOcean automated backups
   # Database backups: Run daily backup script
   ```

### Environment Variables (All Deployments)

```
# Database
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# NextAuth
NEXTAUTH_SECRET="<generate with openssl rand -base64 32>"
NEXTAUTH_URL="https://yourdomain.com"

# YouTube
YOUTUBE_API_KEY="<from Google Cloud Console>"

# X/Twitter (optional — only needed if using paid API tier instead of scraping)
# TWITTER_API_KEY="<from Twitter Developer Portal>"
# TWITTER_API_SECRET="<from Twitter Developer Portal>"
# TWITTER_BEARER_TOKEN="<from Twitter Developer Portal>"

# Instagram (optional — only needed if using Graph API; scraping works without)
FACEBOOK_APP_ID="<from Facebook Developer, optional>"
FACEBOOK_APP_SECRET="<from Facebook Developer, optional>"
INSTAGRAM_ACCESS_TOKEN="<user access token, optional>"

# TikTok (if using API)
TIKTOK_API_KEY="<if available>"
TIKTOK_API_SECRET="<if available>"

# Scraping Configuration (for X, Instagram fallback, TikTok)
PLAYWRIGHT_HEADLESS="true"
SCRAPE_DELAY_MS="3000"
SCRAPE_MAX_RETRIES="3"

# Email (for notifications)
SMTP_FROM="noreply@yourdomain.com"
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT=587
SMTP_USER="apikey"
SMTP_PASSWORD="<SendGrid API key>"

# App
NODE_ENV="production"
LOG_LEVEL="info"
CRON_SECRET_TOKEN="<random token for cron auth>"
```

---

# PART 3: STEP-BY-STEP BUILD PLAN FOR CLAUDE CODE

This section provides 8 phases of implementation, each deliverable in 1-3 Claude Code sessions.

---

## Phase 1: Project Scaffolding, Database Schema & Authentication

**Duration**: 2-3 sessions
**Deliverables**: 
- Next.js app created, configured
- PostgreSQL database schema
- NextAuth.js authentication setup
- Login/registration pages functional

### Session 1.1: Project Setup & Database Schema

**Prompt for Claude Code**:
```
Set up a new Next.js 14 project with the following:

1. Create a new Next.js project with App Router, TypeScript, and Tailwind CSS
2. Install these dependencies:
   - prisma @prisma/client
   - next-auth bcryptjs
   - zod
   - recharts (for charts)
   - axios
   - dotenv
   - iconoir-react (for icons — Clutch brand uses Iconoir with 1.6px stroke)
   
3. Create the Prisma schema file at prisma/schema.prisma with all the models:
   - User, Organization, SocialAccount
   - Post, PostMetric, AccountDailyRollup
   - SyncLog, DataImport
   - NextAuth models (Account, Session, VerificationToken)
   
   Include all enums: Platform, UserRole, ContentFilter, SyncStatus, PostType, MetricType
   
   Add all indexes as specified in the spec

4. Create .env.local file (template):
   - DATABASE_URL (point to local PostgreSQL or use placeholder)
   - NEXTAUTH_SECRET (generate with openssl)
   - NEXTAUTH_URL
   - API keys placeholders for YouTube, Twitter, Instagram, TikTok
   
5. Run 'npx prisma migrate dev --name init' to create initial migration
6. Seed the database with test data:
   - 1 organization
   - 1 admin user + 1 viewer user
   - 2-3 sample social accounts (youtube, twitter, instagram)
   - 5-10 sample posts with metrics

4b. Configure Tailwind CSS with Clutch Group Visual Identity:
   - In tailwind.config.js, extend the theme with Clutch brand colors:
     * 'clutch-red': '#FF154D' (primary accent)
     * 'clutch-blue': '#121B6C' (secondary accent)
     * 'clutch-black': '#05090E' (primary dark)
     * 'clutch-grey': '#1F2328' (secondary dark)
     * 'clutch-white': '#EBEFF4' (light backgrounds)
   - Set DM Sans as the default font family:
     * Import from Google Fonts in globals.css: @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;800&display=swap')
     * Set fontFamily.sans to ['DM Sans', 'sans-serif'] in tailwind config
   - Create CSS variables in globals.css for the brand colors
   - This must match the Clutch Viewership Tracker's visual identity

5. Add Clutch logo files to public/logos/:
   - clutch-logo-dark.png (for light backgrounds)
   - clutch-logo-white.png (for dark backgrounds)
   - clutch-icon.png (C brand mark only, for favicon)

Project structure should follow the detailed file structure from the spec.
```

**Files to Create**:
- `/package.json` - Dependencies
- `/prisma/schema.prisma` - Database schema
- `/prisma/seed.ts` - Database seeding script
- `/prisma/migrations/001_init/migration.sql` - Initial schema
- `.env.local` - Environment variables (local)
- `.env.example` - Template for env vars
- `tsconfig.json` - TypeScript config
- `tailwind.config.js` - Tailwind CSS config (with Clutch brand colors and DM Sans font)
- `next.config.js` - Next.js config
- `styles/globals.css` - Global styles with DM Sans import and CSS variables

**Commands to Run**:
```bash
npm install
npx prisma migrate dev --name init
npx prisma db seed
```

---

### Session 1.2: NextAuth.js Setup & Authentication Pages

**Prompt for Claude Code**:
```
Set up NextAuth.js authentication for the app:

1. Create lib/auth.ts with NextAuth.js v5 configuration:
   - CredentialsProvider (email + password)
   - PrismaAdapter for database sessions
   - JWT strategy for sessions
   - Callbacks for JWT enrichment with user role and organizationId
   - Secure cookie settings (httpOnly, secure, sameSite)

2. Create middleware.ts for protecting routes:
   - Redirect unauthenticated users to /login
   - Verify admin role for /api/users routes
   - Allow all users to access /api/accounts, /api/posts, /api/metrics

3. Create these pages in app/(auth)/:
   - app/(auth)/login/page.tsx - Login form with email/password
   - app/(auth)/register/page.tsx - Registration form with validation
   - app/(auth)/layout.tsx - Auth layout (centered card)

4. Create API routes:
   - app/api/auth/[...nextauth]/route.ts - NextAuth handler
   - app/api/auth/register/route.ts - Registration endpoint (creates user, encrypts password with bcrypt)

5. Create lib/api-keys.ts with:
   - encrypt(value: string): string function using crypto
   - decrypt(encrypted: string): string function
   - Use for storing API credentials securely in DB

6. Create lib/validators.ts with Zod schemas for:
   - User login/registration validation
   - Email format, password strength
   - Social account creation validation
   - Date range validation for reports

7. Create lib/errors.ts with custom error classes:
   - AuthenticationError
   - AuthorizationError
   - NotFoundError
   - ValidationError
   - APIError

8. Create hooks/useAuth.ts:
   - Hook to get current user session
   - Hook to check if user is authenticated
   - Hook to check if user is admin

Forms should use Zod validation on submit before sending to API.
```

**Files to Create**:
- `lib/auth.ts` - NextAuth configuration
- `lib/api-keys.ts` - Encryption/decryption utilities
- `lib/validators.ts` - Zod validation schemas
- `lib/errors.ts` - Custom error classes
- `middleware.ts` - Route protection middleware
- `app/(auth)/layout.tsx` - Auth layout
- `app/(auth)/login/page.tsx` - Login page
- `app/(auth)/register/page.tsx` - Register page
- `app/api/auth/[...nextauth]/route.ts` - NextAuth handler
- `app/api/auth/register/route.ts` - Registration API
- `hooks/useAuth.ts` - useAuth hook
- `components/auth/LoginForm.tsx` - Login form component
- `components/auth/RegisterForm.tsx` - Register form component

---

### Session 1.3: API Middleware & Error Handling

**Prompt for Claude Code**:
```
Create API request/response utilities:

1. Create lib/db.ts:
   - Export prisma client singleton
   - Add custom model extensions if needed for common queries

2. Create lib/api-handler.ts:
   - Higher-order function to wrap API routes
   - Automatically handle authentication check
   - Catch errors and format responses
   - Log all requests
   - Return proper HTTP status codes

   Example usage:
   export const POST = apiHandler(async (req, session) => {
     // Your handler code
   }, { requireAuth: true, requireAdmin: true })

3. Create lib/utils/date.ts:
   - formatDate(date: Date, format: string): string
   - parseDate(dateStr: string): Date
   - getDateRange(type: 'last7days'|'last30days'|'thisMonth'|'custom', from?, to?): [Date, Date]
   - isValidDateRange(startDate: Date, endDate: Date): boolean

4. Create lib/utils/metrics.ts:
   - calculateEngagementRate(views|impressions: number, engagements: number): number
   - normalizeMetricAcrossPlatforms(metric: string, platform: Platform, value: number): number
   - aggregateMetricsByDate(metrics: PostMetric[]): { date: Date, total: number }[]
   - calculateDailyRollup(posts: Post[], metrics: PostMetric[]): AccountDailyRollup

5. Create types/index.ts:
   - Type definitions for all API responses
   - DashboardMetrics, PostPerformance, PlatformComparison, etc.

Test all validation and error handling with curl or Postman.
```

**Files to Create**:
- `lib/db.ts` - Prisma client
- `lib/api-handler.ts` - API route wrapper
- `lib/utils/date.ts` - Date utilities
- `lib/utils/metrics.ts` - Metrics utilities
- `types/index.ts` - TypeScript type definitions

---

## Phase 2: Account Management (CRUD for Social Accounts)

**Duration**: 1-2 sessions
**Deliverables**:
- Social account creation/edit/delete
- Account listing page
- API credentials storage (encrypted)
- Connection testing

### Session 2.1: Account Management API & Components

**Prompt for Claude Code**:
```
Create social account management functionality:

1. Create API routes in app/api/accounts/:
   - GET /api/accounts - List accounts for organization (admin only)
   - POST /api/accounts - Create new account (admin only)
   - GET /api/accounts/[id] - Get account details
   - PUT /api/accounts/[id] - Edit account (admin only)
   - DELETE /api/accounts/[id] - Delete account (admin only)
   - POST /api/accounts/test-connection - Test API credentials (admin only)

   For each route:
   - Validate authentication and authorization
   - Use Zod schemas for input validation
   - Encrypt API keys/tokens before saving
   - Return appropriate error messages
   - Handle platform-specific logic

2. Create form components:
   - components/forms/AccountForm.tsx
     * Platform selector (youtube, twitter, instagram, tiktok)
     * Account ID/handle input
     * Account name input
     * Content filter toggle (all / video_only)
     * API key/token input (password field)
     * Test connection button
     * Submit button (POST on create, PUT on edit)
   
   - components/forms/FilterForm.tsx
     * Date range picker (from/to dates)
     * Platform multi-select
     * Content type filter toggle: "All Content" / "Video Only" — when Video Only is active, non-video posts are hidden and primary metric switches to Views across all dashboards
     * Apply button

3. Create account management pages:
   - app/(dashboard)/accounts/page.tsx
     * List all accounts in a table
     * Columns: Platform, Account Name, Content Filter, Last Synced, Status
     * Action buttons: View, Edit, Sync, Delete
     * "Add Account" button leads to /accounts/new
     * Delete confirmation modal
   
   - app/(dashboard)/accounts/new/page.tsx
     * Display AccountForm component
     * Submit creates account, redirects to accounts list
   
   - app/(dashboard)/accounts/[id]/page.tsx
     * Display AccountForm pre-filled with account data
     * Submit updates account

4. Create card components:
   - components/cards/AccountCard.tsx - Platform icon, account name, stats
   - components/cards/KPICard.tsx - Displays metric value and trend

5. Create UI components:
   - components/common/Modal.tsx - Confirmation modal
   - components/common/LoadingSpinner.tsx
   - components/common/Toast.tsx - Notifications

6. Create hooks:
   - hooks/useAccounts.ts - Fetch/manage accounts
   - hooks/useExport.ts - Export functionality

Add proper error handling, loading states, and user feedback (toast notifications).
```

**Files to Create**:
- `app/api/accounts/route.ts` - List and create accounts
- `app/api/accounts/[id]/route.ts` - Get, edit, delete account
- `app/api/accounts/test-connection/route.ts` - Test API credentials
- `app/(dashboard)/accounts/page.tsx` - Account list page
- `app/(dashboard)/accounts/new/page.tsx` - Create account page
- `app/(dashboard)/accounts/[id]/page.tsx` - Edit account page
- `components/forms/AccountForm.tsx` - Account form component
- `components/forms/FilterForm.tsx` - Filter form component
- `components/cards/AccountCard.tsx` - Account card
- `components/cards/KPICard.tsx` - KPI display card
- `components/common/Modal.tsx` - Modal component
- `components/common/LoadingSpinner.tsx` - Loading indicator
- `components/common/Toast.tsx` - Toast notification
- `hooks/useAccounts.ts` - Account management hook
- `hooks/useExport.ts` - Export functionality hook

---

## Phase 3: Data Collectors (One per Platform)

**Duration**: 3-4 sessions (1 session per platform)
**Deliverables**:
- Working collectors for YouTube, X/Twitter, Instagram, TikTok
- Sync job queue setup
- Cron job trigger

### Session 3.1: YouTube Collector & Job Queue Setup

**Prompt for Claude Code**:
```
Set up YouTube data collection:

1. Install dependencies:
   - googleapis (Google API client)
   - bullmq (for job queues)
   - ioredis (Redis client for queue backend)
   - Or use Prisma-based queue if Redis unavailable

2. Create lib/collectors/base-collector.ts:
   - Abstract class BaseCollector
   - Abstract methods: fetchPosts(), fetchMetrics(), getAccountStats()
   - Generic sync() method that orchestrates the flow
   - Error handling, rate limiting, retry logic
   - Logging

3. Create lib/collectors/youtube.ts:
   - YouTubeCollector extends BaseCollector
   - Constructor takes SocialAccount and apiKey
   - fetchPosts() uses youtube.search.list() to get all uploads
     * Handle pagination
     * Extract video ID, title, description, published date, thumbnail
     * Return PostData[]
   
   - fetchMetrics() uses youtube.videos.list() for statistics
     * Get views, likes, comments, watch duration
     * For each video, fetch metrics endpoint
     * Create PostMetric records
   
   - getAccountStats() returns subscriber count, channel info
   - Separate logic for Shorts, Regular Videos, Live Streams
   - Handle rate limiting (10,000 units/day)

4. Create lib/workers/sync-worker.ts:
   - syncWorkerQueue - Bull queue for sync jobs
   - Process queue: For each job, call platform collector.sync()
   - Update SyncLog with results
   - Update SocialAccount.lastSyncedAt, syncStatus
   - Retry failed jobs 3 times with exponential backoff
   - Emit events (syncStarted, syncCompleted, syncFailed)

5. Create lib/tasks/cron-jobs.ts:
   - dailySyncJob - Trigger at 2 AM UTC
   - Call syncWorkerQueue.add() for all active accounts
   - Log job creation

6. Create app/api/accounts/[id]/sync/route.ts:
   - POST endpoint to manually trigger sync
   - Validate admin role
   - Add job to queue with force=true (skip throttling)
   - Return { syncLog, status: 'queued' }

7. Create app/api/sync-logs/route.ts:
   - GET endpoint to retrieve sync history
   - Query: accountId, status, limit, offset
   - Return paginated SyncLog records with error details

8. Setup local Redis (or skip if using simpler queue):
   - Option A: Install Redis locally for development
   - Option B: Use in-memory queue (less reliable but works for demo)

Test manually:
- Create a YouTube account with valid API key
- Trigger manual sync via API
- Verify posts and metrics are created in database
```

**Files to Create**:
- `lib/collectors/base-collector.ts` - Abstract base class
- `lib/collectors/youtube.ts` - YouTube collector implementation
- `lib/workers/sync-worker.ts` - Queue and orchestration
- `lib/tasks/cron-jobs.ts` - Cron job definitions
- `app/api/accounts/[id]/sync/route.ts` - Manual sync endpoint
- `app/api/sync-logs/route.ts` - Sync logs endpoint
- Update `package.json` with new dependencies

**Commands**:
```bash
npm install googleapis bullmq ioredis
npm install -D @types/node
npx prisma generate
```

---

### Session 3.2: X/Twitter Collector (Scraping-Based, No Paid API Required)

**Prompt for Claude Code**:
```
Create X/Twitter data collector using Playwright web scraping (no paid X API tier needed):

1. Create lib/collectors/twitter.ts:
   - TwitterCollector extends BaseCollector
   - Constructor takes SocialAccount with accountName (e.g., "PUBGEsports")
   - NO paid API keys required — uses browser-based scraping

   - fetchPosts():
     * Use Playwright to open the account's profile page (x.com/{accountName})
     * Scroll to load recent posts from the timeline
     * Extract post metadata from DOM: post_id, text, published_at, media type (video/image/text)
     * Detect video posts vs text/image posts (video posts have view counts)
     * Support scrolling to load more posts (configurable depth)
     * Return PostData[]

   - fetchMetrics():
     * For each post, either:
       (a) Visit the individual post page and extract metrics from DOM
           - Views: from aria-label on analytics link (for video posts)
           - Likes, Retweets, Replies, Quotes, Bookmarks: from engagement buttons
       (b) Use X's internal GraphQL TweetDetail endpoint from the browser session
           - Endpoint: /i/api/graphql/.../TweetDetail
           - Returns full metrics including view counts in JSON
     * Create PostMetric records with appropriate metric types
     * For video posts: primary metric = views
     * For text/image posts: primary metric = impressions (if available) or engagements

   - getAccountStats():
     * Parse profile page for followers_count, following_count
     * Return current follower count

   - Error handling:
     * Handle rate limiting (429) with exponential backoff
     * Handle page load timeouts
     * Handle bot detection (rotate user agents)
     * Log scraping errors separately for manual review

   - Rate limiting:
     * 2-5 second delay between page loads
     * Max ~100 post lookups per sync cycle
     * Respect rate limit responses

2. Create lib/utils/twitter-scraper.ts:
   - Helper functions for parsing X/Twitter page DOM
   - extractPostsFromTimeline() - Parse posts from profile page
   - extractMetricsFromPost() - Parse engagement metrics from post page
   - extractMetricsFromGraphQL() - Parse metrics from TweetDetail API response
   - Robust parsing with fallback selectors

3. Update app/api/accounts/test-connection/route.ts:
   - For twitter platform, use Playwright to verify the profile page loads
   - Return { valid: true, username: "..." } on success
   - Return { valid: false, error: "Account not found" } on failure

4. Verify sync workflow:
   - Create test Twitter account entry (just needs the account handle, no API keys)
   - Trigger manual sync
   - Check posts and metrics are stored
   - Verify video posts have view counts

Note: This approach requires no paid X API tier. If the team later wants to use
the official API ($100/mo Basic or $5,000/mo Pro), the collector can be swapped
to use twitter-api-v2 package as a drop-in replacement thanks to the BaseCollector pattern.
```

**Files to Create/Update**:
- `lib/collectors/twitter.ts` - Twitter collector (scraping-based)
- `lib/utils/twitter-scraper.ts` - Twitter scraping helpers
- Update `app/api/accounts/test-connection/route.ts` - Add Twitter validation
- Playwright is already installed from TikTok collector (Session 3.4)

---

### Session 3.3: Instagram Collector

**Prompt for Claude Code**:
```
Create Instagram data collector:

1. Create lib/collectors/instagram.ts:
   - InstagramCollector extends BaseCollector
   - Constructor takes SocialAccount with Instagram accessToken (from OAuth)
   - fetchPosts():
     * Use official Instagram Graph API
     * First get IG account ID from GET /{page-id}/instagram_business_account
     * Then fetch media using GET /{ig-user-id}/media
     * Extract: id, media_type (IMAGE|VIDEO|CAROUSEL), caption, media_product_type, timestamp, permalink
     * Distinguish between REELS, FEED, STORIES
     * Return PostData[]
   
   - fetchMetrics():
     * Use GET /{media-id}/insights endpoint
     * Available metrics: impressions, reach, likes, comments, saved, shares, engagement
     * For different media types, available metrics vary
     * Create PostMetric records
   
   - getAccountStats():
     * GET /{ig-user-id}/insights with metric=impressions,reach,follower_count
     * Return follower_count and aggregated metrics
   
   - Rate limiting: 200 calls/hour - implement queue-based backoff

2. Create OAuth setup guide:
   - Document how to:
     * Create Facebook Business Account
     * Connect Instagram Business Account
     * Get access token
     * Add to form UI as instructions

3. Update account creation to support Instagram OAuth flow:
   - Add button "Connect Instagram Business Account"
   - Redirect to Facebook OAuth
   - Store returned access_token in encrypted field

4. Test manually with test Instagram business account

Note: Official Instagram API is more restricted. Profile visits and some engagement metrics
may not be available. Document limitations.
```

**Files to Create/Update**:
- `lib/collectors/instagram.ts` - Instagram collector
- `lib/collectors/instagram-oauth.ts` - OAuth helper (optional)
- `components/forms/InstagramOAuthButton.tsx` - OAuth button component
- Update `app/api/accounts/route.ts` - Handle OAuth flow

**Commands**:
```bash
npm install axios
```

---

### Session 3.4: TikTok Collector (Scraping Approach)

**Prompt for Claude Code**:
```
Create TikTok data collector using web scraping:

1. Install dependencies:
   npm install playwright

2. Create lib/collectors/tiktok.ts:
   - TikTokCollector extends BaseCollector
   - Constructor takes SocialAccount with accountId (username or handle)
   - fetchPosts():
     * Use Playwright to open TikTok profile page
     * Scroll to load videos
     * Extract video metadata from DOM or JSON embedded in page
     * Parse: video_id, title, description, publish_time, cover_image
     * Handle pagination (scroll to bottom, wait for more videos)
     * Return PostData[]
   
   - fetchMetrics():
     * For each video, parse metrics from page:
       - viewCount, likeCount, commentCount, shareCount
     * Some metrics may require opening individual video page
     * Be respectful: 2-5 second delay between requests
     * Return PostMetric[] (may have limited data)
   
   - getAccountStats():
     * Parse profile page for follower_count, video_count
     * Return follower_count
   
   - Error handling:
     * Handle page load timeouts
     * Handle bot detection (rotating user agents, proxy support optional)
     * Log scraping errors separately - may indicate account needs manual review

3. Create lib/utils/tiktok-scraper.ts:
   - Helper functions for parsing TikTok page HTML
   - extractVideosFromDOM() - Parse video elements
   - extractMetricsFromPage() - Parse view/like/comment counts
   - Robust parsing (handle page changes gracefully)

4. Implement rate limiting:
   - Add minimum delay between video scrapes (2-5 seconds)
   - Implement exponential backoff on errors
   - Log warnings if hitting rate limits

5. Document TikTok scraping limitations:
   - Metrics may lag behind (hours/days delay)
   - Page structure may change requiring updates
   - Consider adding fallback to official API if available in future

6. Test with test TikTok account (create if needed)
   - Verify videos and metrics are captured
   - Check for scraping errors

Important note: Document ToS implications. TikTok's ToS may prohibit scraping.
Recommend users understand risks or use with caution.
```

**Files to Create**:
- `lib/collectors/tiktok.ts` - TikTok collector
- `lib/utils/tiktok-scraper.ts` - Scraping helpers
- Update `app/api/accounts/test-connection/route.ts` - Test TikTok account

**Commands**:
```bash
npm install playwright
npx playwright install chromium
```

---

## Phase 4: Dashboard UI (Per-Platform Views)

**Duration**: 3-4 sessions
**Deliverables**:
- Dashboard layouts (admin overview + per-platform)
- Charts and data visualizations
- Responsive design with Tailwind CSS

### Session 4.1: Dashboard Layout & Admin Overview

**Prompt for Claude Code**:
```
Create dashboard infrastructure and admin overview:

1. Create app/(dashboard)/layout.tsx:
   - Main dashboard layout with sidebar navigation
   - Sidebar shows:
     * Organization name
     * Logged-in user name
     * Navigation links: Overview, Accounts, YouTube, Twitter, Instagram, TikTok, 
       Comparison, Import, Users (admin only), Settings
     * Logout button
   - Top header with:
     * Current page title
     * Date range selector (default: last 30 days)
     * Refresh button
   - Responsive: Collapse sidebar on mobile

2. Create components/layouts/Sidebar.tsx:
   - Collapsible sidebar with navigation
   - Active link highlighting
   - Icons for each platform
   - Mobile hamburger menu

3. Create components/layouts/Header.tsx:
   - Top navigation bar
   - Display organization and user info
   - Date range picker (reusable)
   - Refresh/sync buttons

4. Create app/(dashboard)/page.tsx (Admin Overview):
   - KPI Cards (top section):
     * Total Views/Impressions (last 7 days)
     * Total Engagements
     * Average Engagement Rate
     * New Followers (delta)
   
   - Platform Performance Tiles (4 columns):
     * YouTube: Views, Engagement, Top Video
     * Twitter: Impressions, Engagement, Top Tweet
     * Instagram: Reach, Engagement, Top Post
     * TikTok: Views, Engagement, Top Video
     * Each tile is a link to platform dashboard
   
   - Content Performance Table:
     * Columns: Platform, Post Title, Post Type, Views, Engagement, Date
     * Sortable, filterable (platform, date range)
     * Pagination (20 rows)
     * Link to post details
   
   - Weekly Trend Chart (Line chart):
     * X-axis: Week number
     * Y-axis: Combined Views/Impressions
     * One line per platform
     * Hover tooltips with exact values
   
   - Account Health Status (small section):
     * Last sync time per platform (green/yellow/red status)
     * Next scheduled sync
     * Manual sync buttons

5. Create app/(dashboard)/layout.tsx styling:
   - Use Tailwind CSS
   - Dark mode support (optional but nice)
   - Responsive grid layout
   - Proper spacing and hierarchy

6. Create sample data fetching:
   - hooks/useMetrics.ts - Fetch aggregated metrics
   - hooks/usePosts.ts - Fetch recent posts
   - hooks/useDashboard.ts - Fetch all dashboard data
   - Use suspense boundaries for loading states

Test layout with mock data before connecting to real API calls.
```

**Files to Create**:
- `app/(dashboard)/layout.tsx` - Dashboard layout
- `app/(dashboard)/page.tsx` - Admin overview page
- `components/layouts/Sidebar.tsx` - Sidebar navigation
- `components/layouts/Header.tsx` - Top header
- `components/layouts/DashboardLayout.tsx` - Reusable dashboard wrapper
- `components/cards/KPICard.tsx` - KPI metric card
- `components/cards/PlatformCard.tsx` - Platform performance tile
- `components/tables/ContentPerformanceTable.tsx` - Posts table
- `components/charts/WeeklyTrendChart.tsx` - Trend visualization
- `components/common/DateRangePicker.tsx` - Date range selection
- Update `hooks/useMetrics.ts` - Metrics fetching
- Update `hooks/usePosts.ts` - Posts fetching

---

### Session 4.2: Platform-Specific Dashboards (YouTube, Twitter)

**Prompt for Claude Code**:
```
Create YouTube and Twitter platform dashboards:

1. YouTube Dashboard (app/(dashboard)/platforms/youtube/page.tsx):
   - KPI Cards:
     * Total Views, Avg Watch Duration, Avg Engagement Rate, Subscribers, Total Watch Hours
   
   - Content Type Tabs:
     * "All", "Shorts", "Regular Videos", "Live Streams"
     * Switch shows different metrics for each type
     * Stats: Count of videos, avg metrics by type
   
   - Video Performance Table:
     * Columns: Thumbnail, Title, Type, Published, Views, Avg Duration, Engagement Rate, Comments
     * Sortable, filterable by type
     * Click row to see detailed metrics
     * Pagination
   
   - Trends Chart (Multi-line):
     * Views trend over time (line)
     * Comments trend over time (line)
     * Engagement rate trend (line)
     * Date range from header selector
   
   - Top Videos Table:
     * Ranking by: Views, Likes, Duration, Comments (switch metric)
     * Shows thumbnail, title, metric value
     * Top 10
   
   - Subscriber Growth Chart:
     * Line chart showing subscriber count over time
     * Annotation for significant growth events (optional)

2. Twitter Dashboard (app/(dashboard)/platforms/twitter/page.tsx):
   - KPI Cards:
     * Total Views (video posts), Total Impressions (all), Avg Engagement Rate, Total Engagements, Followers

   - Content Type Filter:
     * Toggle: "All Content" / "Video Only"
     * When Video Only: hide non-video posts, primary metric = Views

   - Engagement Breakdown:
     * Pie chart: Likes vs Retweets vs Replies vs Quotes
     * Shows distribution of engagement types

   - Tweet Performance Table:
     * Columns: Tweet Text (truncated, link to Twitter), Post Type (video/image/text), Published, Views/Impressions (context-aware), Engagements, Likes, Retweets, Replies
     * When Video Only filter active: only video posts shown, primary column = Views
     * Sortable, filterable
     * Pagination

   - Views/Impressions vs Engagement:
     * Line chart showing both metrics side-by-side
     * Shows correlation

   - Top Tweets Table:
     * By: Views (video), Impressions (other), Engagements, Likes (switch)
     * Shows text, metric value
     * Top 10

   - Follower Growth Chart:
     * Line chart

3. Use Recharts for all charts:
   - LineChart for trends
   - PieChart for engagement breakdown
   - BarChart for top posts comparison
   - ResponsiveContainer for responsive sizing

4. Create data fetching:
   - app/api/metrics/platform/youtube?accountId=...&startDate=...&endDate=...&contentType=...
     Response: { posts, metrics, summary }
   
   - app/api/metrics/platform/twitter?accountId=...&startDate=...&endDate=...
     Response: { posts, metrics, summary }

5. Implement filters:
   - Date range (inherited from header)
   - Platform-specific: content type for YouTube
   - Account selector (if org has multiple accounts per platform)

All pages should be responsive and work on mobile/tablet.
```

**Files to Create**:
- `app/(dashboard)/platforms/youtube/page.tsx` - YouTube dashboard
- `app/(dashboard)/platforms/twitter/page.tsx` - Twitter dashboard
- `app/api/metrics/platform/youtube/route.ts` - YouTube metrics API
- `app/api/metrics/platform/twitter/route.ts` - Twitter metrics API
- `components/dashboards/YouTubeDashboard.tsx` - Reusable YouTube component
- `components/dashboards/TwitterDashboard.tsx` - Reusable Twitter component
- `components/charts/TrendChart.tsx` - Multi-line trend chart
- `components/charts/EngagementPieChart.tsx` - Pie chart
- `components/charts/TopPostsBarChart.tsx` - Bar chart

---

### Session 4.3: Platform Dashboards (Instagram & TikTok)

**Prompt for Claude Code**:
```
Create Instagram and TikTok platform dashboards:

1. Instagram Dashboard (app/(dashboard)/platforms/instagram/page.tsx):
   - KPI Cards:
     * Total Reach, Avg Engagement Rate, Total Engagements, Followers
   
   - Content Type Tabs:
     * "All", "Reels", "Posts", "Carousels"
     * Each shows metrics specific to that type
   
   - Post Performance Table:
     * Columns: Thumbnail, Caption, Type, Published, Reach, Impressions, Engagement Rate, Saves
     * Filterable, sortable
     * Click to see full metrics
   
   - Reach vs Impressions Chart:
     * Line chart showing both metrics
     * Shows spread between reach (unique users) and impressions (total views)
   
   - Top Posts (Image Gallery View):
     * Grid of thumbnails
     * Click to see detailed metrics
     * Sort by: Reach, Engagements, Saves, Impressions
   
   - Follower Growth Chart:
     * Line chart

2. TikTok Dashboard (app/(dashboard)/platforms/tiktok/page.tsx):
   - KPI Cards:
     * Total Views, Avg Engagement Rate, Total Engagements, Followers
   
   - Video Performance Table:
     * Columns: Thumbnail, Title, Published, Views, Watch Time, Engagement Rate, Completion Rate
     * Sortable, filterable
   
   - Views & Engagement Chart:
     * Paired line chart showing both metrics over time
   
   - Top Videos (Grid View):
     * Thumbnails with view counts
     * Click to see details
     * Sort by: Views, Engagement Rate, Watch Time, Completion Rate
   
   - Watch Time Distribution:
     * Histogram or bar chart showing distribution of watch times across videos
     * X-axis: watch time ranges (0-10s, 10-30s, 30-60s, 60s+)
     * Y-axis: number of videos
   
   - Follower Growth Chart:
     * Line chart

3. Create data fetching APIs:
   - app/api/metrics/platform/instagram/route.ts
   - app/api/metrics/platform/tiktok/route.ts

4. Image gallery components:
   - components/cards/PostGridCard.tsx - Individual post in grid
   - components/gallery/PostGallery.tsx - Grid layout

5. Responsive design:
   - Mobile: Single column for tables, stacked cards
   - Tablet: 2 columns
   - Desktop: Full layout
```

**Files to Create**:
- `app/(dashboard)/platforms/instagram/page.tsx` - Instagram dashboard
- `app/(dashboard)/platforms/tiktok/page.tsx` - TikTok dashboard
- `app/api/metrics/platform/instagram/route.ts` - Instagram metrics API
- `app/api/metrics/platform/tiktok/route.ts` - TikTok metrics API
- `components/dashboards/InstagramDashboard.tsx` - Instagram component
- `components/dashboards/TikTokDashboard.tsx` - TikTok component
- `components/cards/PostGridCard.tsx` - Post grid card
- `components/gallery/PostGallery.tsx` - Post gallery grid

---

## Phase 5: Cross-Platform Analytics & Comparison

**Duration**: 1-2 sessions
**Deliverables**:
- Cross-platform comparison dashboard
- Unified metrics

### Session 5.1: Cross-Platform Comparison Dashboard

**Prompt for Claude Code**:
```
Create cross-platform comparison view:

1. Create app/(dashboard)/comparison/page.tsx:
   - Platform Comparison Table:
     * Rows: YouTube, X/Twitter, Instagram, TikTok
     * Columns: Total Views/Impressions, Engagement Count, Engagement Rate, Followers, Date Range
     * Note below explaining that metrics vary by platform
     * Allow toggling which columns to show
   
   - Views/Impressions Trend (Line Chart):
     * One line per platform
     * Normalized or raw data (toggle)
     * X-axis: Date, Y-axis: Views/Impressions
     * Allows toggling platforms on/off to focus on specific ones
   
   - Engagement Distribution (Pie Chart):
     * Shows which platform drives most engagement
     * Total engagement across all platforms
   
   - Growth Comparison (Bar Chart):
     * Follower growth (delta) per platform
     * Period: Last 7/30 days (toggle)
     * Shows growth rate or absolute follower count
   
   - Content Volume (Bar Chart):
     * Posts published per platform
     * Period: Last 7/30 days
   
   - Platform Health Summary (Cards):
     * Each platform card shows:
       - Platform name and logo
       - KPI highlight (most relevant metric)
       - Trend indicator (up/down)
       - Link to platform dashboard

2. Create app/api/metrics/comparison/route.ts:
   - Query: startDate, endDate, normalized=true
   - Fetch metrics for all platforms
   - Aggregate into cross-platform format
   - Return structured data for comparison components
   - Handle missing data gracefully (some platforms may have no accounts)

3. Create lib/utils/normalization.ts:
   - normalizeMetric(metric, platform, value): Normalize different metrics for comparison
   - convertViewsToImpressions(platform, views): Convert views to impressions equivalent
   - createComparisonSummary(metrics): Aggregate cross-platform data

4. Documentation:
   - Add note explaining that platforms use different metrics
   - Clarify that "Views" on YouTube is not directly comparable to "Impressions" on Twitter
   - Recommend using engagement rate or engagement count for comparison

Comparison view should help identify which platforms are most effective and highlight trends.
```

**Files to Create**:
- `app/(dashboard)/comparison/page.tsx` - Comparison page
- `app/api/metrics/comparison/route.ts` - Comparison API
- `components/dashboards/ComparisonDashboard.tsx` - Comparison dashboard component
- `lib/utils/normalization.ts` - Metric normalization helpers
- `components/tables/PlatformComparisonTable.tsx` - Comparison table
- `components/cards/PlatformHealthCard.tsx` - Platform health summary

---

## Phase 6: Export & Stakeholder Features

**Duration**: 1-2 sessions
**Deliverables**:
- CSV and Excel export functionality
- Stakeholder (viewer) dashboard and permissions

### Session 6.1: Export Functionality

**Prompt for Claude Code**:
```
Create data export features:

1. Create lib/utils/export.ts:
   - generateCSV(data: PostMetric[], columns: string[]): string
   - generateExcel(data: PostMetric[], sheetName: string): Buffer
   - Use 'xlsx' library for Excel: npm install xlsx
   - Format dates, numbers appropriately
   - Handle large datasets (100k+ rows)

2. Create app/api/exports/csv/route.ts:
   - POST endpoint
   - Body: { platform?, startDate, endDate, metrics: [] }
   - Query posts and metrics in date range
   - Filter by platform if specified
   - Generate CSV with columns: postId, platform, title, publishedDate, views, likes, comments, etc.
   - Return file with content-type: text/csv
   - Filename: social-media-{platform}-{date}.csv

3. Create app/api/exports/xlsx/route.ts:
   - Similar to CSV but generates Excel file
   - Better for stakeholders (formatted, multiple sheets)
   - Multiple sheets: one per platform if cross-platform export
   - Include summary sheet with aggregate metrics
   - Apply formatting: bold headers, number formatting, date formatting
   - Return file with content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

4. Create export UI components:
   - components/modals/ExportModal.tsx
     * Options: Format (CSV/Excel)
     * Date range (inherited or custom)
     * Platform selector (if cross-platform)
     * Columns selector (which metrics to include)
     * Download button
     * Progress indicator while generating
   
   - Export button on all dashboards (visible to all roles)

5. Create export API routes with proper:
   - Authorization (all authenticated users)
   - Error handling (return 400 if invalid params)
   - Timeout handling (large exports may take time)
   - File cleanup (delete temp files after serving)

6. Test:
   - Export from admin dashboard
   - Export specific platform metrics
   - Verify file content and formatting
   - Verify viewable in Excel
```

**Files to Create**:
- `lib/utils/export.ts` - Export utilities
- `app/api/exports/csv/route.ts` - CSV export endpoint
- `app/api/exports/xlsx/route.ts` - Excel export endpoint
- `components/modals/ExportModal.tsx` - Export modal
- Update `package.json` with 'xlsx'

**Commands**:
```bash
npm install xlsx
```

---

### Session 6.2: User Management & Stakeholder Access

**Prompt for Claude Code**:
```
Create user management and stakeholder features:

1. Create user management pages:
   - app/(dashboard)/users/page.tsx
     * List all users in organization
     * Table: Email, Name, Role, Created Date, Actions (Edit, Delete)
     * "Add User" button
     * Admin only
   
   - app/(dashboard)/users/new/page.tsx
     * Form to create new user
     * Fields: Email, Name, Role (admin/viewer)
     * Send invitation email to new user
     * Admin only
   
   - app/(dashboard)/users/[id]/page.tsx
     * Edit user: Name, Role, Active status
     * Delete option
     * Admin only

2. Create user management API:
   - GET /api/users - List all users (admin only)
   - POST /api/users - Create user (admin only)
   - PUT /api/users/[id] - Edit user (admin only)
   - DELETE /api/users/[id] - Soft delete user (admin only)

3. Create stakeholder dashboard:
   - Viewer role can see same dashboards as admin
   - BUT: No access to:
     * Account management pages
     * User management pages
     * Settings pages
     * Edit/delete buttons
     * API credentials
   - CAN access:
     * View all dashboards (read-only)
     * Export data
     * Filter by date range

4. Implement role-based visibility:
   - In UI components, conditionally render based on session.user.role
   - Middleware protects API routes (middleware.ts already handles)
   - Use hooks/useAuth.ts to check role in components

5. Invitation email:
   - Send email with temp password link
   - Include login URL and instructions
   - User must reset password on first login
   - Implement password reset flow:
     * app/api/auth/forgot-password - Request reset
     * Send reset link via email
     * app/api/auth/reset-password - Submit new password

6. Test:
   - Create admin account, then viewer account
   - Log in as viewer, verify limited access
   - Verify admin can see all features
   - Test export as viewer
```

**Files to Create**:
- `app/(dashboard)/users/page.tsx` - Users list
- `app/(dashboard)/users/new/page.tsx` - Create user
- `app/(dashboard)/users/[id]/page.tsx` - Edit user
- `app/api/users/route.ts` - User CRUD
- `app/api/users/[id]/route.ts` - Single user CRUD
- `app/api/auth/forgot-password/route.ts` - Forgot password
- `app/api/auth/reset-password/route.ts` - Reset password
- `components/forms/UserForm.tsx` - User form
- `lib/email.ts` - Email sending utility
- Update middleware.ts - Protect user management routes

---

## Phase 7: Import Historical Data

**Duration**: 1-2 sessions
**Deliverables**:
- Excel/CSV import functionality
- Bulk data insertion

### Session 7.1: Historical Data Import

**Prompt for Claude Code**:
```
Create historical data import feature:

1. Create import page:
   - app/(dashboard)/import/page.tsx
     * Instructions on Excel format required
     * File upload field (accept .xlsx, .csv)
     * Platform selector (YouTube, Twitter, Instagram, TikTok)
     * "Import Data" button
     * Progress indicator
     * Results summary (success/error count)
     * Errors displayed (which rows failed and why)
     * Admin only

2. Create import API:
   - POST /api/posts/import
   - Body: FormData with file
   - Query: organizationId (required)
   - Process:
     * Parse Excel/CSV file
     * Validate required columns: Platform, PostId, Title, PublishedDate, Views, Likes, Comments, Shares
     * Check for duplicates (post_id, platform, organization)
     * For each row:
       - Create/upsert Post record
       - Create PostMetric records for views, likes, comments, shares
     * Log results in DataImport table
     * Return: { importId, rowsAttempted, rowsSuccessful, errors: [] }

3. Validation rules:
   - Platform must be valid (youtube, twitter, instagram, tiktok)
   - PostId must not be empty
   - PublishedDate must be valid date
   - Numeric metrics must be non-negative integers
   - Skip duplicate posts (check unique: organizationId, socialAccountId, post_id, platform)

4. Error handling:
   - Collect all validation errors, don't stop on first error
   - Return array of { row, column, error } for user review
   - Log full error details for debugging
   - Partial success: Import successful rows, report failed rows

5. Performance:
   - Batch insert for large files (1000+ rows)
   - Use Prisma createMany() with skipDuplicates
   - Show progress bar during import
   - Stream file processing (don't load entire file in memory)

6. Testing:
   - Create sample Excel file with 100 posts across platforms
   - Test import: verify posts and metrics created
   - Test duplicate handling: import same file twice, verify no duplicates
   - Test error handling: invalid data in some rows

Example Excel format:
| Platform | PostId | Title | PublishedDate | Views | Likes | Comments | Shares | PostType |
|----------|--------|-------|---------------|-------|-------|----------|--------|----------|
| youtube  | abc123 | Video Title | 2024-01-15 | 1000 | 50 | 10 | 5 | video |
| twitter  | def456 | Tweet text | 2024-01-15 | 5000 | 200 | 30 | 15 | text |
```

**Files to Create**:
- `app/(dashboard)/import/page.tsx` - Import page
- `app/api/posts/import/route.ts` - Import API
- `components/forms/ImportForm.tsx` - Import form component
- `lib/utils/import.ts` - Import parsing and validation helpers
- Update `package.json` with 'xlsx' and 'csv-parser'

**Commands**:
```bash
npm install csv-parser
```

---

## Phase 8: Deployment & Cron Jobs Setup

**Duration**: 1-2 sessions
**Deliverables**:
- Production deployment to DigitalOcean
- Automated daily sync via cron
- Database backups

### Session 8.1: DigitalOcean Deployment (Droplet Option)

**Prompt for Claude Code**:
```
Deploy to DigitalOcean Droplet:

1. Create deployment documentation:
   - docs/DEPLOYMENT.md with step-by-step instructions

2. Prepare production environment:
   - Create .env.production with:
     * DATABASE_URL for production DB
     * NEXTAUTH_SECRET (generate: openssl rand -base64 32)
     * NEXTAUTH_URL=https://yourdomain.com
     * NODE_ENV=production
     * All API keys for YouTube, Twitter, Instagram, TikTok
     * SMTP credentials for email
     * CRON_SECRET_TOKEN (random string for auth)

3. Create deployment scripts:
   - scripts/deploy.sh - Pulls latest code, builds, restarts server
   - scripts/backup-db.sh - Backs up PostgreSQL database
   - Keep in repo root (Git-ignored in .gitignore)

4. Create PM2 ecosystem config:
   - ecosystem.config.js
     * Define "social-tracker" app with npm start
     * Set NODE_ENV=production
     * Restart strategies, memory limits
     * Logs configuration

5. Create Nginx config:
   - /etc/nginx/sites-available/social-tracker
     * Proxy requests to localhost:3000
     * Enable gzip compression
     * Set proper headers (X-Forwarded-Proto, etc.)
     * Cache static assets

6. Setup SSL:
   - Use Certbot with Nginx
   - Auto-renewal via cron

7. Create database initialization script:
   - scripts/init-database.sh
   - Creates PostgreSQL user, database, runs migrations

8. Create monitoring:
   - Setup error logging (log to file + email alerts)
   - Create health check endpoint (GET /api/health)
   - Monitor with external service (e.g., Pingdom, UptimeRobot)

After following these steps, the app will be deployed and accessible at https://yourdomain.com
```

**Files to Create**:
- `ecosystem.config.js` - PM2 configuration
- `scripts/deploy.sh` - Deployment script
- `scripts/backup-db.sh` - Database backup script
- `scripts/init-database.sh` - Database initialization
- `nginx/social-tracker.conf` - Nginx configuration
- `docs/DEPLOYMENT.md` - Deployment guide
- `.env.production` (not in repo, create on server)
- `.env.example` - Template

---

### Session 8.2: Cron Job Setup & Monitoring

**Prompt for Claude Code**:
```
Setup automated daily sync and monitoring:

1. Create cron job for daily sync:
   - Option A: System cron on Droplet
     * Add to /etc/cron.d/social-tracker
     * Run at 2 AM UTC daily:
       0 2 * * * ubuntu /home/ubuntu/social-tracker/scripts/daily-sync.sh
     * Script contents:
       ```bash
       #!/bin/bash
       curl -X POST https://yourdomain.com/api/sync/trigger \
         -H "Authorization: Bearer $CRON_SECRET_TOKEN" \
         -H "Content-Type: application/json" \
         --silent --show-error
       ```
   
   - Option B: External service (EasyCron)
     * Setup webhook at https://yourdomain.com/api/sync/trigger
     * Schedule for 2 AM UTC daily
     * Requires secure token in URL

2. Create sync trigger endpoint:
   - app/api/sync/trigger/route.ts
     * POST endpoint
     * Validate Authorization header (Bearer token)
     * Fetch all active social accounts
     * Add jobs to sync queue for each account
     * Return { status: 'triggered', accountsQueued: 5 }

3. Create monitoring dashboard:
   - app/(dashboard)/settings/page.tsx
     * View last sync time for each account
     * Manual sync buttons
     * Sync logs (list of recent syncs)
     * Sync status health indicators
     * Error alerts (if sync failed)

4. Setup error notifications:
   - Create lib/email.ts with sendEmail() function
   - Use SMTP (SendGrid, AWS SES, etc.)
   - Send alerts on sync failures
   - Alert admin when account sync fails 3 times

5. Create health check:
   - GET /api/health
     * Returns { status: 'ok'|'error', database: true|false, workers: true|false, lastSync: timestamp }
     * Used by monitoring services for uptime checking

6. Logging:
   - All sync operations logged to:
     * Console (local development)
     * File (production: /var/log/social-tracker/app.log)
     * Error file: /var/log/social-tracker/error.log
   - Use Winston or Pino logging library

7. Database backups:
   - Create backup script: scripts/backup-db.sh
   - Run daily via cron (different time than sync, e.g., 3 AM)
   - Store backups locally (3 days) + cloud storage (S3, DigitalOcean Spaces)
   - Add restore script for recovery

8. Testing:
   - Manually trigger sync via API
   - Verify all accounts sync successfully
   - Check logs for errors
   - Test manual sync button in UI
   - Verify email alerts work on failure

This completes the full build: app is deployed, auto-syncing daily, monitored, and backed up.
```

**Files to Create**:
- `app/api/sync/trigger/route.ts` - Sync trigger endpoint
- `app/(dashboard)/settings/page.tsx` - Settings/monitoring page
- `lib/email.ts` - Email sending utility
- `scripts/daily-sync.sh` - Daily sync trigger script
- `etc/cron.d/social-tracker` - Cron job definition
- `nginx/social-tracker.conf` - Nginx config
- Update logging in all collectors and sync worker

**Commands (on Droplet)**:
```bash
# Setup cron
sudo cp scripts/daily-sync.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/daily-sync.sh
sudo nano /etc/cron.d/social-tracker

# Setup backups
sudo crontab -e
# Add: 0 3 * * * /home/ubuntu/social-tracker/scripts/backup-db.sh
```

---

# SUMMARY

## Build Timeline Estimate

| Phase | Sessions | Duration | Key Deliverables |
|-------|----------|----------|-------------------|
| 1: Setup & Auth | 3 | 1-2 weeks | Next.js, PostgreSQL, NextAuth, login pages |
| 2: Account Mgmt | 1-2 | 1 week | Account CRUD, form validation |
| 3: Collectors | 4 | 2-3 weeks | YouTube, Twitter, Instagram, TikTok collectors, job queue |
| 4: Dashboards | 4 | 2-3 weeks | All platform dashboards, charts, tables |
| 5: Cross-Platform | 1-2 | 1 week | Comparison dashboard, unified metrics |
| 6: Export & Stakeholder | 2 | 1 week | CSV/Excel export, user management, viewer access |
| 7: Import Historical Data | 1-2 | 1 week | Excel import, bulk data insertion |
| 8: Deployment | 2 | 1 week | DigitalOcean setup, cron jobs, monitoring |

**Total: 8 phases, 18-22 sessions, ~12-16 weeks** (assuming 1-2 sessions per week)

## Key Architectural Decisions

1. **Data Model**: Normalized schema with separate PostMetric table for flexible metric tracking; video vs non-video content tracked with appropriate primary metrics (Views vs Impressions)
2. **Collection**: YouTube via API (free tier); X/Twitter and TikTok via Playwright scraping (no paid API tiers required — $0/month); Instagram via Graph API with scraping fallback
3. **Metric Refresh**: Decaying-frequency strategy refreshes metrics for older posts (daily → every 3 days → weekly → monthly) to capture ongoing view accumulation and late-viral content
4. **Authentication**: NextAuth.js with JWT sessions (stateless, scalable)
5. **Job Queue**: Bull queue for reliable sync orchestration
6. **Deployment**: DigitalOcean Droplet with Nginx, PM2, automated backups
7. **Frontend**: Next.js App Router with Tailwind CSS, Recharts for visualization; dashboard-level "Video Only" filter on all platform views

## Critical Success Factors

1. **Data Accuracy**: Collectors must validate data integrity and handle API changes gracefully
2. **Performance**: Optimize queries with proper indexes, paginate large result sets
3. **Reliability**: Implement retry logic, error handling, and monitoring
4. **Security**: Encrypt API credentials, validate all inputs, protect admin routes
5. **User Experience**: Responsive design, loading states, clear error messages

---

### Critical Files for Implementation

**During Phase 1 (Setup & Auth)**:
- `/prisma/schema.prisma` - Core data model; any schema changes ripple through entire app
- `/lib/auth.ts` - Authentication foundation; all protected routes depend on this
- `/middleware.ts` - Route protection; controls access to all admin features

**During Phase 3 (Collectors)**:
- `/lib/collectors/base-collector.ts` - Abstract pattern for all platform-specific collectors
- `/lib/workers/sync-worker.ts` - Job orchestration; handles all data collection flow
- `/lib/tasks/cron-jobs.ts` - Scheduling mechanism; enables automated syncing

**During Phase 4 (Dashboards)**:
- `/app/(dashboard)/layout.tsx` - Dashboard frame; all platform dashboards extend this
- `/components/charts/*.tsx` - Visualization components; required by all dashboard pages
- `/app/api/metrics/` routes - Data APIs; every dashboard depends on these endpoints

**During Phase 7-8 (Deploy)**:
- `/ecosystem.config.js` - Process management on production; handles app restarts and monitoring
- `scripts/backup-db.sh` - Database backup strategy; critical for data protection
- `.env.production` - Production configuration; controls all platform API credentials and secrets