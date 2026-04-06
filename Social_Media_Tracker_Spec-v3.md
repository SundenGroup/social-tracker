# Clutch Social Media Tracker -- Production Spec v3

> **Living reference document.** Reflects exactly what is built and deployed as of April 2026. Not a build plan.

---

## 1. Executive Summary

The Clutch Social Media Tracker is a multi-platform social media analytics dashboard that aggregates performance data from YouTube, Twitter/X, TikTok, and Instagram into a single unified interface. It provides daily metric snapshots, cross-platform comparison, follower tracking, and content performance analysis.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router) |
| Runtime | Node.js, React 19 |
| Database | PostgreSQL (same server) |
| ORM | Prisma 6.19 |
| Auth | NextAuth v5 (beta 30), JWT strategy |
| Styling | Tailwind CSS 4 |
| Charts | Recharts 3.8 |
| Icons | Iconoir (iconoir-react) |
| Scraping | Playwright 1.58 |
| Spreadsheets | xlsx 0.18 (import/export) |
| Validation | Zod 4 |
| Email | Nodemailer 7 |
| Process Manager | PM2 |
| Reverse Proxy | Nginx + Certbot SSL |

### Deployment

- **Host:** DigitalOcean Droplet `164.92.195.12`
- **Domain:** `social.clutch.game`
- **App path:** `/root/clutch-social`
- **GitHub:** `SundenGroup/social-tracker` (main branch)
- **Deploy:** Manual via SSH (no CI/CD)

---

## 2. Visual Identity

### Colors

| Name | Hex | Usage |
|------|-----|-------|
| Accent Red | `#FF154D` | Primary action, highlights |
| Accent Blue | `#121B6C` | Secondary accent |
| Black | `#05090E` | Background, text |
| Grey | `#1F2328` | Cards, borders, secondary surfaces |
| White | `#EBEFF4` | Text on dark, light surfaces |

### Typography

**DM Sans** -- weights 400 (regular), 500 (medium), 800 (extra-bold).

### Icons

Iconoir icon set via `iconoir-react`.

### Logo

Clutch Group "C" mark.

---

## 3. Architecture Overview

```
Browser --> Nginx (SSL) --> Next.js (PM2) --> PostgreSQL
                                   |
                                   +--> YouTube Data API v3
                                   +--> X API v2
                                   +--> Playwright (TikTok/Instagram)

MacBook (launchd) --> Remote Scrapers --> POST /api/sync/ingest --> PostgreSQL
```

### App Router Structure

- `app/api/**` -- API routes (26 endpoints)
- `app/(dashboard)/**` -- Authenticated dashboard pages
- `app/(auth)/**` -- Login, register, forgot/reset password

### Key Directories

| Path | Purpose |
|------|---------|
| `app/api/` | All API route handlers |
| `lib/` | Shared utilities, collectors, sync engine, encryption |
| `components/` | React UI components |
| `prisma/` | Schema, migrations, seed |
| `scripts/tiktok-remote-scraper/` | MacBook-based TikTok scraper |
| `scripts/instagram-remote-scraper/` | MacBook-based Instagram scraper |

---

## 4. Authentication & Authorization

### Provider

NextAuth v5 (beta 30) with **Credentials** provider only (email + bcrypt password, 12 rounds).

### Session Strategy

- JWT with 24-hour `maxAge`
- JWT callback re-validates user every 5 minutes (checks `isActive` flag and org membership)
- Session includes: `userId`, `organizationId`, `role`, `name`, `email`

### Roles

| Role | Capabilities |
|------|-------------|
| `admin` | Full access: manage accounts, users, settings, trigger syncs, full refresh |
| `viewer` | Read-only: view dashboards, metrics, export data |

### Registration Flow

1. First user creates a new Organization and becomes its `admin` + owner
2. Subsequent users join as `viewer` by default
3. Generic error on duplicate email (prevents enumeration)

### Password Reset

1. `POST /api/auth/forgot-password` -- sends reset email with 1-hour token
2. `POST /api/auth/reset-password` -- validates token, sets new password
3. Generic response on all outcomes (prevents user enumeration)
4. Reset tokens are NOT logged

### Route Protection

Middleware intercepts `/dashboard/**` and `/admin/**` routes, redirecting unauthenticated users to login.

---

## 5. Data Model

All IDs are CUIDs. Timestamps are UTC.

### Enums

| Enum | Values |
|------|--------|
| `Platform` | `youtube`, `twitter`, `instagram`, `tiktok` |
| `UserRole` | `admin`, `viewer` |
| `ContentFilter` | `all`, `video_only` |
| `SyncStatus` | `pending`, `syncing`, `success`, `failed` |
| `SyncType` | `initial_full_sync`, `daily_update`, `manual_trigger` |
| `PostType` | `video`, `image`, `carousel`, `text`, `short`, `live`, `story` |
| `MetricType` | `views`, `impressions`, `likes`, `comments`, `shares`, `engagement_rate`, `reach`, `watch_duration`, `ctr`, `bookmarks`, `followers`, `profile_visits` |
| `DataImportStatus` | `pending`, `processing`, `success`, `failed`, `partial` |

### Models

#### Organization

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (CUID) | PK |
| `name` | String | |
| `ownerId` | String? | FK to User |
| `hideSponsored` | Boolean | Default false. Excludes sponsored posts from KPI aggregations |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

Relations: `users[]`, `socialAccounts[]`, `profiles[]`, `dataImports[]`

#### User

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (CUID) | PK |
| `email` | String | Unique |
| `passwordHash` | String | bcrypt 12 rounds |
| `name` | String | |
| `role` | UserRole | Default `viewer` |
| `organizationId` | String | FK |
| `isActive` | Boolean | Default true |

Relations: `organization`, `ownedOrganizations[]`, `dataImports[]`, `accounts[]`, `sessions[]`

#### Profile

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (CUID) | PK |
| `organizationId` | String | FK |
| `name` | String | Unique per org |
| `isDefault` | Boolean | Default false |

Relations: `organization`, `socialAccounts[]`

Unique constraint: `(organizationId, name)`

#### SocialAccount

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (CUID) | PK |
| `organizationId` | String | FK |
| `profileId` | String? | FK to Profile |
| `platform` | Platform | |
| `accountId` | String | Platform-specific identifier |
| `accountName` | String | Display name |
| `contentFilter` | ContentFilter | Default `all` |
| `isActive` | Boolean | Default true |
| `apiKey` | String? | Encrypted (AES-256-GCM) |
| `authToken` | String? | Encrypted (AES-256-GCM) |
| `refreshToken` | String? | Encrypted (AES-256-GCM) |
| `lastSyncedAt` | DateTime? | |
| `syncStatus` | SyncStatus | Default `pending` |

Relations: `organization`, `profile?`, `posts[]`, `postMetrics[]`, `dailyRollups[]`, `syncLogs[]`

Unique constraint: `(organizationId, platform, accountId)`

#### Post

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (CUID) | PK |
| `socialAccountId` | String | FK |
| `platform` | Platform | |
| `postId` | String | Platform-native ID |
| `postType` | PostType | |
| `title` | String? | |
| `description` | String? | |
| `contentUrl` | String | Link to original post |
| `thumbnailUrl` | String? | |
| `publishedAt` | DateTime | |
| `lastMetricRefreshAt` | DateTime? | |
| `isDeleted` | Boolean | Default false (soft delete) |
| `isTrending` | Boolean | Default false (stored, not auto-populated) |
| `isSponsored` | Boolean | Default false |

Relations: `socialAccount`, `metrics[]`

Unique constraint: `(socialAccountId, postId)`

#### PostMetric

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (CUID) | PK |
| `postId` | String | FK |
| `socialAccountId` | String | FK |
| `platform` | Platform | |
| `metricDate` | Date | Snapshot date |
| `metricType` | MetricType | |
| `metricValue` | BigInt | Cumulative snapshot value |
| `recordedAt` | DateTime | When the record was written |

Unique constraint: `(postId, metricType, metricDate)`

**Important:** Values are cumulative snapshots, not deltas. Trend charts compute day-over-day deltas at query time.

#### AccountDailyRollup

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (CUID) | PK |
| `socialAccountId` | String | FK |
| `platform` | Platform | |
| `rollupDate` | Date | |
| `totalFollowers` | BigInt | Populated during sync |
| `newFollowers` | BigInt | Populated during sync |
| `postsPublished` | Int | Populated during sync |
| `totalViews` | BigInt | Default 0 (NOT populated) |
| `totalLikes` | BigInt | Default 0 (NOT populated) |
| `totalComments` | BigInt | Default 0 (NOT populated) |
| `totalShares` | BigInt | Default 0 (NOT populated) |
| `totalImpressions` | BigInt | Default 0 (NOT populated) |
| `totalReach` | BigInt | Default 0 (NOT populated) |
| `engagementRate` | Float | Default 0.0 |

Unique constraint: `(socialAccountId, rollupDate)`

#### SyncLog

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (CUID) | PK |
| `socialAccountId` | String | FK |
| `syncType` | SyncType | |
| `status` | SyncStatus | Default `pending` |
| `errorMessage` | String? | |
| `postsSynced` | Int | Default 0 |
| `metricsSynced` | Int | Default 0 |
| `startedAt` | DateTime | |
| `completedAt` | DateTime? | |

#### DataImport

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (CUID) | PK |
| `organizationId` | String | FK |
| `fileName` | String | |
| `fileSize` | BigInt | |
| `platform` | Platform? | |
| `status` | DataImportStatus | |
| `errorDetails` | String? | |
| `rowsAttempted` | Int | |
| `rowsSuccessful` | Int | |
| `createdById` | String | FK to User |

#### NextAuth Models

`Account`, `Session`, `VerificationToken` -- standard NextAuth/Prisma adapter models.

### Database Indexes

| Table | Index Columns |
|-------|--------------|
| Post | `(socialAccountId, publishedAt)` |
| Post | `(platform, publishedAt)` |
| Post | `(lastMetricRefreshAt)` |
| Post | `(isDeleted, socialAccountId, publishedAt)` |
| PostMetric | `(postId, metricType, metricDate)` |
| PostMetric | `(socialAccountId, metricType, metricDate)` |
| PostMetric | `(socialAccountId, metricDate)` |
| SocialAccount | `(organizationId, platform)` |
| SocialAccount | `(organizationId, isActive)` |
| SocialAccount | `(platform, accountId)` |
| SyncLog | `(socialAccountId, createdAt)` |
| SyncLog | `(socialAccountId, status, startedAt)` |
| SyncLog | `(status, createdAt)` |
| AccountDailyRollup | `(socialAccountId, rollupDate)` |
| AccountDailyRollup | `(socialAccountId, platform, rollupDate)` |

---

## 6. Data Collection

### YouTube

- **API:** Google YouTube Data API v3
- **Auth:** API key stored encrypted on SocialAccount
- **Quota:** Soft limit of 9,000 units tracked internally
- **Discovery:** Batch fetch up to 50 videos per request
- **Shorts detection:** Duration <=180 seconds AND URL probe to `youtube.com/shorts/{id}` (10-second timeout)
- **Metrics collected:** views, likes, comments
- **Content types:** Video, Short, Live

### Twitter/X

- **API:** X API v2
- **Auth:** Bearer token stored encrypted on SocialAccount
- **Rate limiting:** 429 retry with exponential backoff + random jitter
- **Discovery:** 50 posts per fetch
- **Metric refresh window:** 14 days (only re-fetches metrics for posts published in the last 14 days)
- **Metrics collected:** impressions, likes, retweets (stored as shares), replies (stored as comments), bookmarks

### TikTok (Server-Side)

- **Method:** Playwright headless Chrome
- **Auth:** Optional session cookies
- **Discovery:** Scrolls profile page, parses video cards from DOM
- **Metrics:** Extracted from `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON in page source; per-video page fallback for uncached entries
- **Date extraction:** Snowflake ID timestamp fallback when publish date unavailable
- **Metrics collected:** views, likes, comments, shares

### Instagram (Server-Side)

- **Method:** Playwright headless Chrome
- **Auth:** REQUIRES session cookies (`sessionid` + `csrftoken`)
- **API:** Internal feed endpoint `/api/v1/feed/user/{userId}/`
- **Discovery:** Paginated, up to 200 posts
- **Metrics collected:** likes, comments, plays (stored as views)

---

## 7. Sync Infrastructure

### Queue

- Prisma-based job queue using the `SyncLog` table (no Redis dependency)
- Atomic check-and-create with `Serializable` transaction isolation to prevent duplicate syncs

### Retry Logic

- 3 retries with exponential backoff + random jitter
- Sync marked as `failed` only if >50% of posts fail during a run

### Stale Detection

- API-based platforms (YouTube, Twitter): 30-minute threshold
- Browser-based platforms (TikTok, Instagram): 60-minute threshold
- Stale syncs are detected and their SyncLog records are updated (not deleted) to preserve audit trail

### Collector Pipeline

1. `fetchPosts()` -- discover new posts from platform
2. `fetchMetrics()` -- get current metric values for known posts
3. **Transaction** (120-second timeout): upsert posts + upsert metric snapshots
4. Update account stats (`lastSyncedAt`, `syncStatus`)
5. Persist `AccountDailyRollup` (followers, post count)

### Data Integrity

- **Follower 0-protection:** If follower extraction returns 0 but the previous recorded value was non-zero, the rollup update is skipped (guards against scraping failures)
- **Text sanitization:** Strips control characters, null bytes; handles surrogate pair safety
- Existing SyncLog entries are updated rather than deleted to maintain full audit history

### Cron

- `POST /api/sync/trigger` (authenticated via `CRON_SECRET_TOKEN` bearer header)
- Runs `dailySyncJob()`: cleans expired sessions + verification tokens, then queues sync for all active accounts
- Must be triggered externally (no built-in scheduler)

### Full Metric Refresh

- `POST /api/admin/full-refresh` (admin only)
- Re-fetches metrics for all historical posts across all accounts
- `GET /api/admin/full-refresh` returns live progress: `processedPosts`, `totalPosts`, ETA, errors
- Returns `409 Conflict` if a refresh is already in progress
- Progress state is in-memory (single-server; lost on restart)

---

## 8. Dashboard & Analytics

### Main Dashboard (`/dashboard`)

**KPI Cards:**
- Total views
- Total engagements (likes + comments + shares)
- Engagement rate
- Total impressions
- Post count
- Total followers
- Follower growth

**Charts & Tables:**
- Trend chart: views over time, broken down by platform (stacked area/line)
- Platform cards: per-platform summary with key metrics
- Content performance table: top 5,000 posts, sortable, paginated

**Filters:**
- Date range (default: last 30 days, end date = yesterday)
- Content type: All / Video / Short-form / Long-form / Image
- Profile (persisted in localStorage + URL params)

**Period comparison:** Automatically calculated for the previous period of equal length.

### Platform Pages (`/dashboard/youtube`, `/dashboard/twitter`, `/dashboard/tiktok`, `/dashboard/instagram`)

Each platform page includes:
- KPI cards (platform-specific)
- Followers bar chart
- Trend chart (views, likes, shares over time)
- Engagement distribution pie chart
- Top posts bar chart
- Thumbnail gallery (top 15 posts)
- Performance table (25 per page, sortable with keyboard navigation)

**Platform-specific tabs:**
- YouTube: All / Shorts / Videos / Live
- Instagram: All / Reels / Posts / Carousel

### Comparison (`/dashboard/comparison`)

**Cross-Platform Comparison:**
- Metrics: reach, engagements, engagement rate, followers, follower growth, post count
- Platform health cards
- Comparison table
- Multi-line trend chart
- Engagement distribution pie chart
- Content volume bar chart

**Period-over-Period Comparison:**
- Two configurable date ranges
- Presets: previous period, same period last year, custom
- Overlay trend chart
- Platform breakdowns with change percentages

---

## 9. Post Management

### Sponsored Toggle

- Per-post `isSponsored` boolean
- When Organization `hideSponsored` is enabled, sponsored posts are excluded from all KPI aggregations

### Soft Delete

- `isDeleted` flag (default false)
- Soft-deleted posts excluded from all queries, including PATCH operations
- No hard delete exposed

### Trending

- `isTrending` boolean stored on Post
- Currently not auto-populated (set manually or via import)

### Import

- **Formats:** CSV, XLSX, XLS
- **Max file size:** 10 MB
- **Required columns:** `postId`, `platform`, `postType`, `title`, `publishedDate`, `views`, `likes`, `comments`, `shares`
- **Processing:** Batch of 500 rows at a time
- **Audit:** Creates a `DataImport` record tracking `rowsAttempted`, `rowsSuccessful`, status
- **Partial success:** Supported -- individual row failures do not abort the import

### Export

- **CSV:** `GET /api/exports/csv` -- filtered by date range + platform
- **XLSX:** `GET /api/exports/xlsx` -- filtered by date range + platform

---

## 10. User & Organization Management

### Organization

- Multi-tenant: all data (accounts, posts, metrics, profiles) scoped by `organizationId`
- Settings: `hideSponsored` toggle via `PATCH /api/settings`
- First registered user creates the org and is assigned as owner + admin

### Users

- `GET /api/users` -- list users in org (admin only)
- `POST /api/users` -- create user (admin only, viewer role by default)
- `PATCH /api/users/[id]` -- update user (admin only)
- `DELETE /api/users/[id]` -- deactivate user (admin only)

### Profiles

- Group social accounts by content category (e.g., "Esports Main", "Regional")
- `GET /api/profiles` -- list profiles for org
- `POST /api/profiles` -- create profile
- `PATCH /api/profiles/[id]` -- update profile
- `DELETE /api/profiles/[id]` -- delete profile
- Dashboard filtering by selected profile, persisted in localStorage + URL params

---

## 11. Security

### Credential Encryption

- AES-256-GCM encryption for all stored API keys and tokens
- Uses `ENCRYPTION_KEY` env var; falls back to `NEXTAUTH_SECRET` if not set

### HTTP Security Headers

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `Strict-Transport-Security` | Enabled (HSTS) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | Strict |
| `Permissions-Policy` | Restrictive |
| `X-Powered-By` | Disabled |

### Request Tracing

- Random 16-character hex request ID generated for every API request
- Included in server logs, `X-Request-Id` response header, and error JSON bodies

### Input Validation

- Zod schemas on: ingest endpoint, registration, account creation
- File size validation on import (10 MB max)

### Error Handling

- `ErrorBoundary` component wraps all dashboard pages
- API errors return structured JSON with request ID
- Password reset tokens are never logged

### Authorization Enforcement

Admin-only endpoints: full-refresh, account detail view, settings PATCH, user management CRUD.

---

## 12. API Reference

All routes under `/api/`. Auth column: `session` = requires NextAuth session; `cron` = requires `CRON_SECRET_TOKEN` bearer; `admin` = requires admin role session; `public` = no auth.

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `*` | `/api/auth/[...nextauth]` | public | NextAuth handler (login, session, etc.) |
| `POST` | `/api/auth/register` | public | Register new user (+ create org if first) |
| `POST` | `/api/auth/forgot-password` | public | Request password reset email |
| `POST` | `/api/auth/reset-password` | public | Reset password with token |
| `GET` | `/api/health` | public | Health check |
| `GET` | `/api/accounts` | session | List social accounts for org |
| `POST` | `/api/accounts` | admin | Create social account |
| `GET` | `/api/accounts/[id]` | admin | Get account details (credentials excluded from response) |
| `PATCH` | `/api/accounts/[id]` | admin | Update social account |
| `DELETE` | `/api/accounts/[id]` | admin | Delete social account |
| `POST` | `/api/accounts/[id]/sync` | admin | Trigger manual sync for one account |
| `POST` | `/api/accounts/test-connection` | admin | Validate credential format |
| `GET` | `/api/profiles` | session | List profiles for org |
| `POST` | `/api/profiles` | session | Create profile |
| `PATCH` | `/api/profiles/[id]` | session | Update profile |
| `DELETE` | `/api/profiles/[id]` | session | Delete profile |
| `GET` | `/api/metrics/dashboard` | session | Main dashboard data (KPIs, trends, posts) |
| `GET` | `/api/metrics/platform/[platform]` | session | Platform-specific metrics |
| `GET` | `/api/metrics/comparison` | session | Cross-platform comparison data |
| `GET` | `/api/metrics/period-comparison` | session | Period-over-period comparison |
| `PATCH` | `/api/posts/[id]` | session | Update post (sponsored, trending, soft delete) |
| `POST` | `/api/posts/import` | admin | Import posts from CSV/XLSX |
| `GET` | `/api/exports/csv` | session | Export posts as CSV |
| `GET` | `/api/exports/xlsx` | session | Export posts as XLSX |
| `GET` | `/api/users` | admin | List users in org |
| `POST` | `/api/users` | admin | Create user |
| `PATCH` | `/api/users/[id]` | admin | Update user |
| `DELETE` | `/api/users/[id]` | admin | Deactivate user |
| `GET` | `/api/settings` | session | Get org settings |
| `PATCH` | `/api/settings` | admin | Update org settings |
| `GET` | `/api/sync-logs` | session | List sync log entries |
| `POST` | `/api/sync/trigger` | cron | Trigger daily sync for all active accounts |
| `POST` | `/api/sync/ingest` | cron | Remote scraper data ingest |
| `POST` | `/api/admin/full-refresh` | admin | Start full metric refresh |
| `GET` | `/api/admin/full-refresh` | admin | Get full refresh progress |

---

## 13. Remote Scrapers

Both scrapers run on a MacBook, scheduled via `launchd`, and push data to the server's `/api/sync/ingest` endpoint.

### TikTok Scraper

- **Location:** `scripts/tiktok-remote-scraper/`
- **Files:** `scrape.ts` (main), `browser-server.ts` (persistent Chrome), `com.clutch.tiktok-scraper.plist` (launchd config)
- **Method:** Connects to persistent Chrome instance via CDP (Chrome DevTools Protocol), scrapes profile page + individual video pages
- **Auth:** `CRON_SECRET_TOKEN` for API ingest; optional TikTok session cookies
- **Config:** `.env` with `API_URL`, `API_TOKEN`, TikTok usernames
- **Retry:** 3 attempts with 5-minute delay between failures

### Instagram Scraper

- **Location:** `scripts/instagram-remote-scraper/`
- **Files:** `scrape.ts` (main), `browser-server.ts` (persistent Chrome)
- **Method:** Connects to persistent Chrome via CDP, calls Instagram's internal API from authenticated browser session
- **Auth:** `CRON_SECRET_TOKEN` for API ingest; REQUIRES Instagram session cookies (`sessionid` + `csrftoken`)
- **Config:** `.env` with `API_URL`, `API_TOKEN`, Instagram usernames
- **Retry:** 3 attempts with 5-minute delay between failures

### Browser Server (both platforms)

- `browser-server.ts` launches a persistent Chromium instance with `playwright` and exposes the CDP endpoint
- CDP endpoint is written to `.browser-cdp` file for the scraper to read
- Allows session cookies to persist across scraper runs without re-authentication

### Ingest Flow

1. Scraper collects posts + metrics from platform
2. `POST /api/sync/ingest` with `Authorization: Bearer {CRON_SECRET_TOKEN}`
3. Zod-validated body: `{ platform, accountId, posts[] (max 500), stats? }`
4. Server creates SyncLog, upserts posts + metrics in transaction, persists follower rollup

---

## 14. Deployment

### Server

- **Provider:** DigitalOcean Droplet
- **IP:** `164.92.195.12`
- **SSH:** `ssh root@164.92.195.12` (key: `~/.ssh/id_ed25519`)
- **App path:** `/root/clutch-social`
- **Process manager:** PM2 (app name: `clutch-social`)
- **Reverse proxy:** Nginx with SSL via Certbot
- **Domain:** `social.clutch.game`

### Deploy Command

```bash
ssh root@164.92.195.12 'cd /root/clutch-social && git pull origin main && npm ci --production=false && npx prisma generate && npx prisma migrate deploy && npm run build && pm2 restart clutch-social'
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | JWT signing secret |
| `NEXTAUTH_URL` | `https://social.clutch.game` |
| `ENCRYPTION_KEY` | AES-256-GCM key for credential encryption |
| `CRON_SECRET_TOKEN` | Bearer token for sync/trigger and ingest endpoints |
| `SMTP_*` | Nodemailer SMTP configuration for password reset emails |

---

## 15. Known Limitations

1. **YouTube share count** -- unavailable via the public YouTube Data API
2. **YouTube watch duration** -- requires Analytics API with OAuth (not implemented)
3. **Instagram cookie expiry** -- session cookies expire and must be manually re-exported from a browser
4. **TikTok per-video scraping** -- slow for videos not in hydration cache; requires individual page loads
5. **Trending flag** -- `isTrending` is stored but never auto-populated
6. **AccountDailyRollup aggregate fields** -- `totalViews`, `totalLikes`, `totalComments`, `totalShares`, `totalImpressions`, `totalReach` columns exist but are always 0 (not aggregated from PostMetric)
7. **ContentFilter** -- `all`/`video_only` is stored on SocialAccount but not applied in dashboard queries
8. **No full-text search** -- posts cannot be searched by title/description
9. **No webhooks or notifications** -- no Slack, email, or webhook integrations for alerts
10. **External cron required** -- the server has no internal scheduler; `POST /api/sync/trigger` must be called by an external cron (e.g., system crontab, uptime monitor)
11. **Full refresh in-memory state** -- progress tracking is in-memory; lost on PM2 restart

---

## 16. Key File Reference

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Complete data model |
| `app/api/sync/ingest/route.ts` | Remote scraper ingest endpoint |
| `app/api/sync/trigger/route.ts` | Cron-triggered daily sync |
| `app/api/admin/full-refresh/route.ts` | Full metric refresh |
| `app/api/metrics/dashboard/route.ts` | Main dashboard data |
| `app/api/metrics/platform/[platform]/route.ts` | Per-platform metrics |
| `app/api/metrics/comparison/route.ts` | Cross-platform comparison |
| `app/api/metrics/period-comparison/route.ts` | Period-over-period comparison |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth configuration |
| `app/api/posts/import/route.ts` | CSV/XLSX import |
| `app/api/exports/csv/route.ts` | CSV export |
| `app/api/exports/xlsx/route.ts` | XLSX export |
| `lib/api-keys.ts` | AES-256-GCM encrypt/decrypt |
| `lib/collectors/base-collector.ts` | Abstract sync flow (fetchPosts → metrics → transaction) |
| `lib/collectors/youtube.ts` | YouTube Data API v3 collector |
| `lib/collectors/twitter.ts` | X API v2 collector |
| `lib/collectors/tiktok.ts` | TikTok browser scraper collector |
| `lib/collectors/instagram.ts` | Instagram browser scraper collector |
| `lib/workers/sync-worker.ts` | Sync queue, retry logic, stale detection |
| `lib/tasks/cron-jobs.ts` | Daily sync job + session cleanup |
| `lib/metrics-helper.ts` | DISTINCT ON SQL for latest metric snapshots |
| `lib/api-handler.ts` | API route wrapper (auth, request ID, error handling) |
| `scripts/tiktok-remote-scraper/scrape.ts` | TikTok remote scraper |
| `scripts/tiktok-remote-scraper/browser-server.ts` | TikTok persistent Chrome |
| `scripts/instagram-remote-scraper/scrape.ts` | Instagram remote scraper |
| `scripts/instagram-remote-scraper/browser-server.ts` | Instagram persistent Chrome |
| `middleware.ts` | Route protection |
| `next.config.ts` | Security headers, Next.js config |
| `package.json` | Dependencies and scripts |
