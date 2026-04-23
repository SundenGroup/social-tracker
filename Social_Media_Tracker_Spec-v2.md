# Social Media Performance Tracker - Product Spec & Build Plan

---

# APPENDIX A: PROVEN DATA COLLECTION METHODOLOGY

> **IMPORTANT FOR CLAUDE CODE**: This appendix documents the exact scraping techniques that were successfully used to gather the initial dataset (612 YouTube Shorts, 1,200 Instagram posts, 630 TikTok videos, 655 X/Twitter posts). The automated collectors in this tool should replicate these proven approaches. Each method was battle-tested and produced complete, accurate data.

---

## A.1 YouTube Shorts Scraping (612 videos)

**Target**: youtube.com/@PUBGEsports/shorts
**Method**: DOM scraping with auto-scroll in headless/authenticated browser

### DOM Selectors Used
```javascript
// Get all short cards on the page
document.querySelectorAll('ytd-rich-item-renderer')

// Extract video ID from link
element.querySelector('a[href*="/shorts/"]')  // href = /shorts/VIDEO_ID

// Extract title
element.querySelector('.shortsLockupViewModelHostOutsideMetadataTitle')

// Extract view count text (e.g., "2.1K views")
element.querySelector('.shortsLockupViewModelHostOutsideMetadataSubhead')
```

### Scrolling Strategy
```javascript
// Auto-scroll to load all shorts
window.scrollBy(0, 1500);  // scroll 1500px
// Wait 1500ms between scrolls
// Initial page loads ~48 shorts, scrolling loads more
// Stop when publication dates go before January 1, 2025
```

### Data Accumulation
```javascript
// Store in global array, deduplicate by ID
window._uniqueData = [];
// For each ytd-rich-item-renderer:
//   Extract: id, views (raw text like "2.1K views"), title
//   Skip if id already in _uniqueData
```

### Date Extraction
- YouTube Shorts page does NOT show publication dates in the DOM
- Used YouTube oEmbed API to fetch metadata: `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={VIDEO_ID}&format=json`
- For dates, fetched individual video pages and parsed publication date from page metadata
- Used binary search to find the exact cutoff between 2025 and pre-2025 videos

### What Worked / What Didn't
- **Worked**: DOM scraping with `querySelectorAll('ytd-rich-item-renderer')`, auto-scrolling, oEmbed API for titles
- **Didn't work**: Direct HTTP requests from server (403 blocked), needed browser context with cookies

### Columns Captured
`id` (YouTube video ID, 11 chars), `title`, `views` (numeric), `publishDate` (ISO date)

---

## A.2 Instagram Scraping (1,200 posts)

**Target**: @pubgesports (User ID: `11202118190`)
**Method**: Instagram's internal REST API called from authenticated browser session

### API Endpoint
```
GET https://www.instagram.com/api/v1/feed/user/11202118190/
```

### Required Headers
```javascript
headers: {
  'x-ig-app-id': '936619743392459',   // Instagram's web app ID (constant)
  'x-requested-with': 'XMLHttpRequest',
},
credentials: 'include'  // Send cookies from logged-in session
```

### Pagination
```javascript
// First request: no max_id parameter
// Response includes: { items: [...], more_available: true, next_max_id: "..." }
// Subsequent requests: append ?max_id={next_max_id}
// Stop when: more_available === false OR oldest post.taken_at < Jan 1 2025

let nextMaxId = null;
while (true) {
  const url = `https://www.instagram.com/api/v1/feed/user/11202118190/?count=12${nextMaxId ? '&max_id=' + nextMaxId : ''}`;
  const response = await fetch(url, { headers, credentials: 'include' });
  const data = await response.json();

  for (const post of data.items) {
    // Deduplicate
    if (!window._allIGPosts.find(p => p.id === post.id)) {
      window._allIGPosts.push({
        id: post.pk,
        code: post.code,                    // Instagram shortcode (for URL)
        media_type: post.media_type,         // 1=photo, 2=video, 8=carousel
        taken_at: post.taken_at,             // Unix timestamp
        like_count: post.like_count,
        comment_count: post.comment_count,
        play_count: post.play_count || 0,    // Video plays (video/reel only)
        view_count: post.view_count || 0,    // Total views (video/reel only)
        caption: (post.caption?.text || '').substring(0, 300),
        carousel_media_count: post.carousel_media_count || 0
      });
    }
  }

  if (!data.more_available) break;
  nextMaxId = data.next_max_id;

  // Check if oldest post is before cutoff
  const oldestTimestamp = data.items[data.items.length - 1].taken_at;
  if (oldestTimestamp < 1735689600) break; // Jan 1, 2025 UTC

  // Rate limiting: wait between requests
  await new Promise(r => setTimeout(r, 2000));
}
```

### Media Type Mapping
| `media_type` value | Content Type |
|---|---|
| 1 | Photo (static image) |
| 2 | Video / Reel |
| 8 | Carousel (multiple images/videos) |

### Key Fields Available from API Response
Each `items[]` entry contains:
- `pk` — Unique post ID (numeric)
- `code` — Shortcode for URL construction (`instagram.com/p/{code}/`)
- `media_type` — 1 (photo), 2 (video/reel), 8 (carousel)
- `taken_at` — Unix timestamp of publication
- `like_count` — Total likes
- `comment_count` — Total comments
- `play_count` — Video play count (only for video/reel, 0 for photos)
- `view_count` — Total view count (only for video/reel, 0 for photos)
- `caption.text` — Post caption text
- `carousel_media_count` — Number of items in carousel (only for type 8)
- `image_versions2.candidates[0].url` — Thumbnail URL
- `video_versions[0].url` — Video URL (for video posts)

### What Worked / What Didn't
- **Worked**: The `/api/v1/feed/user/{userId}/` endpoint with `x-ig-app-id` header, called from browser with session cookies. Pagination via `next_max_id` was reliable. Got all 1,200 posts.
- **Didn't work**: Direct HTTP requests from outside browser (blocked). Need authenticated browser session.
- **Important**: The `x-ig-app-id: 936619743392459` is Instagram's web app constant — it's not a personal API key.

### Alternative Approach: Network Interception
Also intercepted API calls during normal scrolling by monkey-patching `fetch()` and `XMLHttpRequest.prototype`:
```javascript
// Intercept fetch calls to capture Instagram API responses
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (args[0].includes('/api/v1/feed/user/')) {
    const clone = response.clone();
    const data = await clone.json();
    // Process data.items...
  }
  return response;
};
```

---

## A.3 TikTok Scraping (630 videos)

**Target**: @pubgesports TikTok account
**Method**: Pre-rendered HTML parsing from `__UNIVERSAL_DATA_FOR_REHYDRATION__` script tag

### Why Direct API Didn't Work
Multiple approaches were tried and failed:
1. **Profile API** (`/api/post/item_list/?secUid=...`) — Returned empty despite proper signing
2. **Creator API** (`/api/creator/item_list/?count=30`) — Returned empty
3. **Network interception** (patching `fetch()` and `XMLHttpRequest`) — TikTok returned empty responses
4. **Individual video fetching** — Got rate-limited (403) after ~60 requests

### What Actually Worked: Server-Rendered HTML Parsing

TikTok embeds ALL video data in a `<script>` tag in the initial HTML page load. This is the hydration data used by their React app.

```javascript
// The data lives in a script tag on the profile page:
// <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
//   { "__DEFAULT_SCOPE__": { "webapp.user-detail": { "userInfo": {...}, "itemList": [...] } } }
// </script>

// Extract the hydration data
const script = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
const universalData = JSON.parse(script.textContent);
const userDetail = universalData['__DEFAULT_SCOPE__']['webapp.user-detail'];
const userInfo = userDetail.userInfo;
const itemList = userDetail.itemList;  // Array of video objects
```

### Video Object Structure (from itemList)
Each video in `itemList` contains:
```javascript
{
  id: "7341234567890123456",      // TikTok video ID
  desc: "Video description...",    // Video description/caption
  createTime: 1709251200,          // Unix timestamp
  stats: {
    playCount: 45200,              // Total views
    diggCount: 1234,               // Likes
    commentCount: 56,              // Comments
    shareCount: 23,                // Shares
    collectCount: 89               // Bookmarks/saves
  },
  video: {
    duration: 45,                  // Video duration in seconds
    cover: "https://...",          // Thumbnail URL
    playAddr: "https://..."        // Video URL
  }
}
```

### Practical Collection Approach
Since TikTok's API was blocked, the approach that worked was:

1. **User visits TikTok profile page** in Chrome while logged in
2. **Scroll to load all videos** — TikTok lazy-loads video cards
3. **Extract from hydration data** OR from visible DOM elements:

```javascript
// DOM approach (fallback): Extract view counts from video cards
document.querySelectorAll('strong[class*="video-views"]')
// Returns elements like: <strong class="video-views">31.2K</strong>

// Parse view count text to numbers
function parseViews(text) {
  text = text.trim();
  if (text.endsWith('K')) return Math.round(parseFloat(text) * 1000);
  if (text.endsWith('M')) return Math.round(parseFloat(text) * 1000000);
  return parseInt(text.replace(/,/g, ''));
}
```

4. **Extract video IDs** from video card links:
```javascript
// Video links follow pattern: /@username/video/{VIDEO_ID}
document.querySelectorAll('a[href*="/video/"]')
```

5. **For full metadata**: Use TikTok's individual video page which also contains `__UNIVERSAL_DATA_FOR_REHYDRATION__` with the video's stats

### Columns Captured
`id` (TikTok video ID), `desc` (description), `createTime` (Unix timestamp), `views`, `likes`, `comments`, `shares`, `bookmarks`

### What Worked / What Didn't
- **Worked**: Parsing `__UNIVERSAL_DATA_FOR_REHYDRATION__` script tag from HTML, DOM scraping of video cards
- **Didn't work**: Any direct API calls (all returned empty or got 403), network interception (empty responses)
- **Key insight**: TikTok's anti-bot is very aggressive. The most reliable approach is parsing the pre-rendered HTML that TikTok sends on initial page load.

---

## A.4 X/Twitter Scraping (655 video posts)

**Target**: @PUBGEsports (video posts only, since January 2025)
**Method**: Profile page DOM scraping + X's internal GraphQL API

### Profile Page Scrolling
```javascript
// Navigate to x.com/PUBGEsports
// Auto-scroll to load tweets
window.scrollBy(0, 1500);  // 1500ms intervals

// Extract tweet data from timeline DOM
document.querySelectorAll('article[data-testid="tweet"]')
```

### View Count Extraction (Two Methods)

**Method 1: DOM — Analytics Link Aria Labels**
```javascript
// Views are in the aria-label of the analytics link
const analyticsLink = article.querySelector('a[href*="/analytics"]');
// aria-label = "423 views" or "1.2K views"
const viewText = analyticsLink?.getAttribute('aria-label');
```

**Method 2: GraphQL TweetDetail API (More Reliable)**
```javascript
// X's internal GraphQL endpoint — accessible from authenticated browser session
const tweetId = '1234567890123456789';
const variables = encodeURIComponent(JSON.stringify({
  focalTweetId: tweetId,
  with_rux_injections: false,
  includePromotedContent: true,
  withCommunity: true,
  withQuickPromoteEligibilityTweetFields: true,
  withBirdwatchNotes: true,
  withVoice: true,
  withV2Timeline: true
}));
const features = encodeURIComponent(JSON.stringify({
  // ... standard feature flags (large object, copy from network tab)
}));

const url = `https://x.com/i/api/graphql/ShZ7Ptnc5jM_23VVusteFw/TweetDetail?variables=${variables}&features=${features}`;

const response = await fetch(url, {
  headers: {
    'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    'x-csrf-token': getCookie('ct0'),  // CSRF token from cookies
    'content-type': 'application/json',
  },
  credentials: 'include'
});

const data = await response.json();
// Views are at: data.data.tweetResult.result.views.count
// Or navigate through: instructions[0].entries[0].content.itemContent.tweet_results.result.views.count
```

### Key Details
- **Bearer token**: `AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA` — This is X's PUBLIC bearer token used by the web client (not a personal API key)
- **CSRF token**: Read from `ct0` cookie: `document.cookie.match(/ct0=([^;]+)/)?.[1]`
- **Rate limiting**: GraphQL API returns 429 after ~70 requests in quick succession. Use 2-5 second delays between requests.
- **Batch approach**: Process post IDs in batches of ~35-40, with longer pauses between batches

### Fallback: Manual Post Visit
When rate-limited on GraphQL, navigate to individual post URLs and scrape from DOM:
```javascript
// Navigate to: https://x.com/PUBGEsports/status/{tweetId}
// Then extract views from:
document.querySelector('a[href*="/analytics"]')?.getAttribute('aria-label')
// Returns "X,XXX views" text
```

### Columns Captured
`id` (Tweet ID), `text` (tweet text), `date` (ISO), `views`, `likes`, `retweets`, `replies`, `quotes`, `bookmarks`, `media_type` (video/image/text)

---

## A.5 Summary: Collector Implementation Guide

| Platform | Primary Method | Auth Required | Rate Limit Strategy | Key Selector/Endpoint |
|----------|---------------|---------------|--------------------|-----------------------|
| YouTube | DOM scraping of shorts page | Browser cookies | 1.5s scroll delay | `ytd-rich-item-renderer`, oEmbed API for titles |
| Instagram | REST API `/api/v1/feed/user/{id}/` | Browser cookies + `x-ig-app-id: 936619743392459` | 2s between pages | Pagination via `next_max_id` |
| TikTok | HTML parsing `__UNIVERSAL_DATA_FOR_REHYDRATION__` | Browser cookies (optional) | N/A (single page load) | `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">` |
| X/Twitter | GraphQL TweetDetail API | Browser cookies + `ct0` CSRF | 2-5s between requests, batches of 35 | `/i/api/graphql/.../TweetDetail` + public bearer token |

### Critical Notes for Automated Collectors
1. **All scraping runs in browser context** — Playwright with a logged-in session. No server-side HTTP requests work (all get blocked).
2. **Instagram's `x-ig-app-id`** (`936619743392459`) is a constant — it's Instagram's web app identifier, not a personal key.
3. **X's bearer token** is public — the same one used by every X web client. The CSRF token (`ct0` cookie) is what authenticates the specific session.
4. **TikTok is the hardest** — Direct API calls fail. Must parse the pre-rendered HTML from page load. The `__UNIVERSAL_DATA_FOR_REHYDRATION__` script contains all video data.
5. **For metric refreshes on older posts**: Use the same GraphQL/API approach to re-fetch individual post metrics. Instagram and X both support fetching a single post's metrics by ID.

---

## Executive Summary

The Social Media Performance Tracker is a web-based analytics platform designed to automate the collection, aggregation, and visualization of performance metrics across YouTube, X/Twitter, Instagram, and TikTok for PUBG Esports social media management.

Current state: **Fully built and deployed** at `social.clutch.game`. All platforms are actively syncing data via automated cron jobs (2 AM UTC daily). Historical data has been imported and the system tracks ongoing metrics.

**Tech Stack**: Next.js 16 (App Router), PostgreSQL, NextAuth.js v5, Playwright (for scraping), DigitalOcean Droplet with PM2 + Nginx

**Data Collection**: YouTube uses Data API v3 (free tier, batched 50 videos per request). X/Twitter and TikTok use Playwright-based web scraping with stored session cookies (no paid API tiers required). Instagram uses Playwright with internal REST API (`/api/v1/feed/user/`) from authenticated browser sessions. TikTok scraping runs remotely from a MacBook and pushes data via `/api/sync/ingest` endpoint.

**Deployment**: DigitalOcean Droplet at `164.92.195.12`, domain `social.clutch.game`, PM2 process manager (app name: `clutch-social`), manual deploy via SSH

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
1. **Account Management**: Connect social media accounts via API keys or browser cookies, manage permissions, add/remove accounts
2. **Profile Management**: Group social accounts into profiles (e.g., "PUBG Esports EN", "PUBG Esports TR") for filtering across all dashboards
3. **Dashboard Access**: View aggregated performance across all platforms in one place, with profile selector and content type filters
4. **Data Settings**: Configure content filters, hide sponsored posts from stats/charts, manage scraping credentials
5. **User Management**: Create stakeholder accounts, assign read-only access, manage permissions
6. **Historical Data Import**: Bulk import data from Excel files via the Import page
7. **Export Data**: Generate CSV/Excel reports for any date range, per platform or cross-platform
8. **Period Comparison**: Compare metrics between two arbitrary time periods (e.g., Feb 2026 vs Feb 2025)
9. **Full Metric Refresh**: Trigger a background job to refresh metrics for ALL posts across all platforms, with live progress tracking (elapsed time, ETA, posts processed)

### Viewer/Stakeholder User Stories
1. **View Dashboards**: See performance metrics on a read-only dashboard (no edit access)
2. **Export Reports**: Download CSV/Excel exports of metrics they have access to
3. **Date Filtering**: Filter metrics by date range, per platform, and by content type (All, Video, Short-form, Long-form, Image)
4. **Profile Filtering**: Filter all dashboards by profile using the global profile selector
5. **Comparison Views**: Compare performance across platforms or across time periods

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
├── hideSponsored (BOOLEAN, default false — excludes sponsored posts from KPIs/charts)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Profiles (Account Grouping)
```
profiles
├── id (UUID, PK)
├── organization_id (FK)
├── name (VARCHAR, e.g., "PUBG Esports EN")
├── description (TEXT, nullable)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)

Indexes:
- (organization_id)
```

Profiles group social accounts across platforms (e.g., all English-language accounts under one profile). All dashboards support filtering by profile via a global selector.

#### Social Media Accounts
```
social_accounts
├── id (UUID, PK)
├── organization_id (FK)
├── profile_id (FK → profiles.id, nullable — groups accounts by profile)
├── platform (ENUM: youtube, twitter, instagram, tiktok)
├── account_id (VARCHAR, platform-specific ID, unique per platform)
├── account_name (VARCHAR, display name, e.g., "@PUBGEsports")
├── content_filter (ENUM: all, video_only)
├── is_active (BOOLEAN)
├── api_key / auth_token (encrypted VARCHAR, if using API)
├── cookie_data (TEXT, encrypted — browser cookies for Playwright-based scraping)
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
├── is_trending (BOOLEAN, flagged when metrics spike unexpectedly)
├── is_sponsored (BOOLEAN, marks sponsored/paid content — excluded from stats when hideSponsored is on)

Indexes:
- (social_account_id, published_at) [for time-range queries]
- (platform, published_at)
- (post_id, platform) [unique constraint equivalent]
- (lastMetricRefreshAt) [for finding posts due for metric refresh]
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

### Admin Dashboard (Home Page — `/`)

**Global Controls:**
- **Profile Selector**: Filter all data by profile (e.g., "PUBG Esports EN", "All Profiles")
- **Date Range Picker**: Custom date range (default: last 30 days)
- **Content Type Tabs**: All | Video | Short-form | Long-form | Image — filters all sections

1. **Key Performance Indicators Cards** (Top section, 4-col grid)
   - Total Views (with % change vs previous period)
   - Total Engagements (with % change)
   - Average Engagement Rate (with % change)
   - Total Followers (with growth count)

2. **Platform Performance Cards** (4 columns: YouTube, X, Instagram, TikTok)
   - Each shows: Total Views, Engagement Count, Top Post title, Followers, Follower Growth
   - Link to platform-specific dashboard

3. **Trend Chart** (Line chart, stacked area)
   - X-axis: Date
   - Y-axis: Views
   - One line per platform (color-coded)
   - Hover tooltips with exact values per platform

4. **Content Performance Table**
   - Columns: Platform icon, Post Title (linked), Post Type, Published Date, Views, Likes, Comments, Shares, Engagement Rate
   - Sponsored posts tagged with badge (excluded from KPIs when hideSponsored is on)
   - Sortable by any column
   - Pagination

5. **Previous Period Comparison**: Automatic comparison against the equivalent previous period (e.g., last 30 days vs 30 days before that) shown as % change on KPI cards

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

### Cross-Platform Comparison Dashboard (`/comparison`)
1. **Platform Comparison Table**:
   - Rows: YouTube, X, Instagram, TikTok
   - Columns: Account Name, Views, Impressions, Reach, Likes, Comments, Shares, Engagements, Engagement Rate, Followers, Follower Growth, Posts
   - Profile and date range filtering

2. **Views Trend (All Platforms)** (Line chart with 4 lines)
   - One line per platform, color-coded
   - X-axis: Date, Y-axis: Views
   - Hover tooltips

3. **Engagement Distribution Pie** (Across all platforms)
   - Shows which platform drives most engagement

4. **Content Volume** (Bar chart)
   - Posts published per platform

### Period Comparison Dashboard (`/period-comparison`)

Dedicated page for comparing metrics between two arbitrary time periods (e.g., Feb 2026 vs Feb 2025).

1. **Period Selection Bar**:
   - Two `DateRangePicker` components side by side (Period A and Period B)
   - Shortcut buttons: "Previous Period" (N days before Period A) and "Same Period Last Year" (same dates, year - 1)
   - Content type tabs: All | Video | Short-form | Long-form | Image

2. **KPI Summary Cards** (4-col grid):
   - Total Views, Total Engagements, Avg Engagement Rate, Posts Published
   - Each card shows Period A value, "vs [Period B value]" subtitle, and % change (green/red)

3. **Platform Cards** (4 columns):
   - Per-platform breakdown with Period A values and % change vs Period B

4. **Overlay Trend Chart** (Line chart):
   - Two lines: Period A (solid, `#121B6C`) and Period B (dashed, `#999`)
   - X-axis: Day offset ("Day 1, Day 2, ...") to align different calendar dates
   - Y-axis: Aggregate views

5. **Per-Platform Comparison Table**:
   - Grouped by platform (bold header rows with border)
   - Rows per platform: Views, Engagements, Engagement Rate, Posts
   - Columns: Metric | Period A | Period B | Change (% with color)

6. **Per-Platform Bar Chart**:
   - Grouped horizontal bars (Period A vs Period B per platform)
   - Metric selector dropdown (views / engagements / posts)

### Settings & Monitoring (`/settings`)

1. **Display Preferences**: Toggle to hide sponsored posts from stats & charts
2. **Full Metric Refresh**: Admin button to trigger a background job that refreshes metrics for ALL posts across all platforms, with live progress tracking:
   - Progress bar
   - 4 stat cards: Elapsed Time, Estimated Remaining, Posts Processed, Metrics Updated
   - Current account indicator
   - Error display
   - Completion summary
3. **System Health**: Database status, last sync time, app version
4. **Sync Alerts**: Highlights accounts with 3+ consecutive sync failures
5. **Account Sync Status**: Per-account cards with status, last sync time, and manual "Sync Now" button
6. **Sync All**: Button to trigger sync for all accounts
7. **Recent Sync Logs**: Table of recent sync operations with status, post count, and errors

### Stakeholder/Viewer Dashboard
- Same as Admin Dashboard, but **read-only**
- No account management, user management, or settings access
- Export buttons available
- Profile selector, date filters, and content type tabs all functional

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
clutch-social/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── [...nextauth]/route.ts      [NextAuth handler]
│   │   │   ├── register/route.ts           [User registration]
│   │   │   ├── forgot-password/route.ts    [Password reset request]
│   │   │   └── reset-password/route.ts     [Password reset submit]
│   │   ├── accounts/
│   │   │   ├── route.ts                    [GET all, POST create accounts]
│   │   │   ├── [id]/
│   │   │   │   ├── route.ts                [GET, PUT, DELETE single account]
│   │   │   │   └── sync/route.ts           [POST manual sync trigger]
│   │   │   └── test-connection/route.ts    [POST verify API connection]
│   │   ├── profiles/
│   │   │   ├── route.ts                    [GET all, POST create profiles]
│   │   │   └── [id]/route.ts               [GET, PUT, DELETE profile]
│   │   ├── posts/
│   │   │   ├── [id]/route.ts               [GET, PATCH post (e.g., toggle sponsored)]
│   │   │   └── import/route.ts             [POST import historical data]
│   │   ├── metrics/
│   │   │   ├── dashboard/route.ts          [GET aggregated dashboard metrics]
│   │   │   ├── platform/
│   │   │   │   └── [platform]/route.ts     [GET platform-specific metrics (dynamic route)]
│   │   │   ├── comparison/route.ts         [GET cross-platform comparison]
│   │   │   └── period-comparison/route.ts  [GET period-vs-period comparison]
│   │   ├── admin/
│   │   │   └── full-refresh/route.ts       [POST start / GET progress of full metric refresh]
│   │   ├── users/
│   │   │   ├── route.ts                    [GET all, POST create users]
│   │   │   └── [id]/route.ts               [GET, PUT, DELETE user]
│   │   ├── exports/
│   │   │   ├── csv/route.ts                [POST generate CSV export]
│   │   │   └── xlsx/route.ts               [POST generate Excel export]
│   │   ├── sync/
│   │   │   ├── trigger/route.ts            [POST cron-triggered sync for all accounts]
│   │   │   └── ingest/route.ts             [POST data ingestion from remote scrapers]
│   │   ├── sync-logs/route.ts              [GET sync history]
│   │   ├── settings/route.ts               [GET/PATCH org settings (hideSponsored, etc.)]
│   │   └── health/route.ts                 [GET system health status]
│   ├── (auth)/
│   │   ├── login/page.tsx                  [Login page]
│   │   ├── register/page.tsx               [Registration page]
│   │   └── layout.tsx                      [Auth layout wrapper]
│   ├── (dashboard)/
│   │   ├── layout.tsx                      [Dashboard layout with sidebar]
│   │   ├── page.tsx                        [Admin home/overview dashboard]
│   │   ├── accounts/
│   │   │   ├── page.tsx                    [Account management page]
│   │   │   ├── [id]/page.tsx               [Account detail/edit page]
│   │   │   └── new/page.tsx                [Create new account page]
│   │   ├── profiles/
│   │   │   ├── page.tsx                    [Profile management page]
│   │   │   └── new/page.tsx                [Create new profile page]
│   │   ├── platforms/
│   │   │   ├── youtube/page.tsx            [YouTube dashboard]
│   │   │   ├── twitter/page.tsx            [X/Twitter dashboard]
│   │   │   ├── instagram/page.tsx          [Instagram dashboard]
│   │   │   └── tiktok/page.tsx             [TikTok dashboard]
│   │   ├── comparison/page.tsx             [Cross-platform comparison]
│   │   ├── period-comparison/page.tsx      [Period-vs-period comparison]
│   │   ├── import/page.tsx                 [Historical data import]
│   │   ├── users/
│   │   │   ├── page.tsx                    [User management page]
│   │   │   ├── [id]/page.tsx               [Edit user page]
│   │   │   └── new/page.tsx                [Create new user page]
│   │   └── settings/page.tsx               [Settings, sync monitoring, full refresh]
│   ├── error.tsx                           [Global error page]
│   ├── not-found.tsx                       [404 page]
│   └── layout.tsx                          [Root layout]
├── lib/
│   ├── db.ts                               [Prisma client singleton]
│   ├── auth.ts                             [NextAuth configuration]
│   ├── api-keys.ts                         [Encryption/decryption for API credentials]
│   ├── api-handler.ts                      [API route wrapper with auth & error handling]
│   ├── validators.ts                       [Zod schemas for input validation]
│   ├── errors.ts                           [Custom error classes]
│   ├── email.ts                            [Email sending (Nodemailer)]
│   ├── metrics-helper.ts                   [Efficient latest-metric queries using DISTINCT ON]
│   ├── utils/
│   │   ├── date.ts                         [Date formatting, range calculations]
│   │   ├── metrics.ts                      [Metric calculations, aggregations]
│   │   ├── export.ts                       [CSV/Excel generation]
│   │   ├── import.ts                       [Data import parsing & validation]
│   │   ├── normalization.ts                [Cross-platform metric normalization]
│   │   ├── twitter-scraper.ts              [Twitter DOM/GraphQL scraping helpers]
│   │   ├── instagram-scraper.ts            [Instagram API scraping helpers]
│   │   ├── tiktok-scraper.ts               [TikTok hydration data extraction]
│   │   └── browser-cookies.ts              [Cookie parsing, validation, loading for Playwright]
│   ├── collectors/
│   │   ├── base-collector.ts               [Abstract base class — fetchPosts, fetchMetrics, sync]
│   │   ├── youtube.ts                      [YouTube Data API v3 collector]
│   │   ├── twitter.ts                      [X/Twitter Playwright + GraphQL collector]
│   │   ├── instagram.ts                    [Instagram Playwright + REST API collector]
│   │   └── tiktok.ts                       [TikTok Playwright + hydration data collector]
│   ├── workers/
│   │   └── sync-worker.ts                  [Prisma-based sync queue (no Redis)]
│   └── tasks/
│       └── cron-jobs.ts                    [Cron job definitions]
├── components/
│   ├── layouts/
│   │   ├── Sidebar.tsx                     [Navigation sidebar with Clutch branding]
│   │   └── Header.tsx                      [Top header bar]
│   ├── charts/
│   │   ├── TrendChart.tsx                  [Multi-line trend visualization]
│   │   ├── WeeklyTrendChart.tsx            [Weekly trend view]
│   │   ├── TopPostsBarChart.tsx            [Bar chart for top posts]
│   │   ├── EngagementPieChart.tsx          [Pie chart engagement breakdown]
│   │   ├── PeriodOverlayChart.tsx          [Two-line overlay chart for period comparison]
│   │   └── PeriodBarChart.tsx              [Grouped bar chart for period comparison]
│   ├── cards/
│   │   ├── KPICard.tsx                     [Metric display card with trend indicator]
│   │   ├── AccountCard.tsx                 [Account info card]
│   │   ├── PlatformCard.tsx                [Platform status card]
│   │   └── PlatformHealthCard.tsx          [Platform health indicator]
│   ├── tables/
│   │   ├── ContentPerformanceTable.tsx     [Post performance table]
│   │   ├── PlatformComparisonTable.tsx     [Cross-platform comparison table]
│   │   ├── PeriodComparisonTable.tsx       [Period-over-period comparison table]
│   │   └── SponsoredToggle.tsx             [Toggle for marking posts as sponsored]
│   ├── forms/
│   │   ├── AccountForm.tsx                 [Create/edit social account]
│   │   ├── UserForm.tsx                    [Create/edit user]
│   │   ├── ImportForm.tsx                  [Upload historical data]
│   │   └── FilterForm.tsx                  [Date range, platform filters]
│   ├── common/
│   │   ├── Modal.tsx                       [Confirmation/action modal]
│   │   ├── Toast.tsx                       [Toast notifications]
│   │   ├── DateRangePicker.tsx             [Date range selector]
│   │   ├── LoadingSpinner.tsx              [Loading state indicator]
│   │   └── ProfileSelector.tsx             [Global profile dropdown]
│   ├── auth/
│   │   ├── LoginForm.tsx                   [Login form]
│   │   └── RegisterForm.tsx                [Registration form]
│   ├── gallery/
│   │   └── PostGallery.tsx                 [Gallery view of posts]
│   ├── modals/
│   │   └── ExportModal.tsx                 [Export options modal]
│   └── providers/
│       ├── Providers.tsx                   [App providers wrapper]
│       └── ProfileProvider.tsx             [Profile context provider]
├── hooks/
│   ├── useAuth.ts                          [Current user & auth state]
│   ├── useDashboard.ts                     [Dashboard metrics & data]
│   ├── useAccounts.ts                      [Account list & management]
│   ├── useProfiles.ts                      [Profile list & selection]
│   ├── useComparison.ts                    [Cross-platform comparison data]
│   ├── usePeriodComparison.ts              [Period-vs-period comparison data]
│   ├── usePlatformDashboard.ts             [Platform-specific dashboard data]
│   └── useExport.ts                        [Export functionality]
├── scripts/
│   ├── tiktok-remote-scraper/              [Standalone TikTok scraper (runs on MacBook)]
│   │   ├── index.ts                        [Main scraper entry point]
│   │   ├── .env                            [API_TOKEN, TIKTOK_USERNAMES, MAX_VIDEOS]
│   │   └── debug-hydration.ts              [Debug script for TikTok hydration data]
│   ├── import-tweets-by-id.ts              [Backfill Twitter posts by tweet ID]
│   └── import-historical-data.ts           [Historical data import script]
├── prisma/
│   ├── schema.prisma                       [Prisma ORM schema]
│   └── prisma.config.ts                    [Prisma configuration]
├── public/
│   └── logos/                              [Clutch brand logos]
├── middleware.ts                            [Route protection middleware]
├── .env                                    [Environment variables (not in repo)]
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
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
  id             String   @id @default(cuid())
  name           String
  ownerId        String
  owner          User     @relation("OrganizationOwner", fields: [ownerId], references: [id])
  hideSponsored  Boolean  @default(false)  // Exclude sponsored posts from KPIs/charts
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  users          User[]
  socialAccounts SocialAccount[]
  profiles       Profile[]
  dataImports    DataImport[]

  @@index([ownerId])
}

model Profile {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name           String
  description    String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  socialAccounts SocialAccount[]

  @@index([organizationId])
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
  profileId       String?
  profile         Profile?     @relation(fields: [profileId], references: [id])
  platform        Platform
  accountId       String   // Platform-specific account ID (e.g., UCxxxxx for YouTube)
  accountName     String   // Display name
  contentFilter   ContentFilter @default(all)
  isActive        Boolean  @default(true)

  // API/Auth credentials (encrypted)
  apiKey          String?  // Encrypted API key or token
  authToken       String?  // Encrypted OAuth token
  refreshToken    String?  // Encrypted refresh token
  cookieData      String?  @db.Text // Encrypted browser cookies for Playwright scraping

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
  isSponsored           Boolean  @default(false)  // Marks sponsored/paid content

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
- Query: `startDate`, `endDate`, `profileId` (optional)
- Output: `{ data: { platforms: PlatformRow[], trends: TrendEntry[], engagementDistribution, contentVolume } }`
- Auth: User from same organization

**GET /api/metrics/period-comparison**
- Query: `startDateA`, `endDateA`, `startDateB`, `endDateB`, `profileId` (optional), `contentType` (optional: video, short-form, long-form, image)
- Output: `{ data: { periodA: PeriodSummary, periodB: PeriodSummary, changes: ChangesSummary } }`
- Auth: User from same organization
- Each period includes: label, summary (totalViews, totalEngagements, avgEngagementRate, totalPosts), per-platform rows, dailyTrend (day offset)

### Profile Routes

**GET /api/profiles**
- Output: `{ data: Profile[] }`
- Auth: User from same organization

**POST /api/profiles**
- Body: { name, description? }
- Output: `{ data: Profile }`
- Auth: Admin role required

**GET /api/profiles/[id]**
- Output: `{ data: Profile }`

**PUT /api/profiles/[id]**
- Body: { name?, description? }
- Auth: Admin role required

**DELETE /api/profiles/[id]**
- Auth: Admin role required

### Settings Routes

**GET /api/settings**
- Output: `{ data: { hideSponsored: boolean } }`
- Auth: User from same organization

**PATCH /api/settings**
- Body: { hideSponsored?: boolean }
- Auth: Admin role required

### Admin Routes

**POST /api/admin/full-refresh**
- Starts a background job to refresh metrics for ALL posts across all platforms
- Returns immediately: `{ status: "started" }`
- Returns 409 if a refresh is already in progress
- Auth: Admin role required

**GET /api/admin/full-refresh**
- Returns current progress: `{ data: { isRunning, totalPosts, processedPosts, metricsUpdated, currentAccount, currentPlatform, elapsedMs, estimatedRemainingMs, ... } }`
- Auth: User from same organization

### Sync Ingestion Route

**POST /api/sync/ingest**
- Body: `{ token, accountId, posts: PostData[], metrics: MetricData[] }`
- Used by remote scrapers (e.g., TikTok scraper on MacBook) to push data to the server
- Auth: Bearer token validation

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

**Queue**: Uses Prisma-based queue (SyncLog table as job queue) — no Redis or Bull required. Each job is a SyncLog record with status='pending'.

**Trigger**:
- Cron job at 2 AM UTC daily (system cron on server calls `/api/sync/trigger`)
- Manual trigger via `/api/accounts/[id]/sync` endpoint
- Remote scrapers push data via `/api/sync/ingest`

**Flow**:
1. `queueSync(accountId, syncType)` creates a pending SyncLog entry
2. `processSyncJob()` fires asynchronously:
   - Selects the platform-specific collector via `getCollector(account)`
   - Calls `collector.sync(syncType)` which orchestrates: fetchPosts → upsert posts → fetchMetrics → upsert metrics → getAccountStats → update rollups
   - Updates `SyncLog` with results
   - Updates `SocialAccount.lastSyncedAt` and `syncStatus`

**Error Handling**:
- Retry failed syncs up to 3 times with exponential backoff (2s, 4s, 8s)
- Log errors in `SyncLog.errorMessage`
- Mark account as `syncStatus='failed'` if all retries exhausted
- Settings page highlights accounts with 3+ consecutive failures

**Concurrency**: Sequential processing per account (one at a time to avoid browser conflicts)

### Full Metric Refresh (app/api/admin/full-refresh/)

**Purpose**: Refresh metrics for ALL posts across all platforms, not just recently published ones. Normal syncs only update metrics for posts discovered via `fetchPosts()` (typically recent posts). The full refresh ensures older posts get updated metrics.

**Flow**:
1. Admin triggers via POST `/api/admin/full-refresh`
2. For each active account:
   - Fetches ALL posts from the database (not just recent)
   - Creates a collector instance
   - For Instagram: calls `fetchPosts()` first to populate the metrics cache
   - Calls `fetchMetrics(allExternalPostIds)` with every post ID
   - Upserts all returned metrics into PostMetric table
3. Tracks progress in-memory (single-server setup)

**Speed by Platform**:
- YouTube: Fast (~50 videos per API batch, ~100ms per batch)
- Twitter: Slow (~3-5s per post, Playwright page visits)
- TikTok: Slow (~3-5s per uncached post, Playwright page visits)
- Instagram: Instant for recently fetched posts (cached), no standalone per-post scraping

**Progress Tracking**: GET endpoint returns isRunning, totalPosts, processedPosts, metricsUpdated, currentAccount, elapsedMs, estimatedRemainingMs

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
  protected account: SocialAccount;
  protected logger: (msg: string) => void;

  constructor(account: SocialAccount) {}

  abstract fetchPosts(): Promise<PostData[]>
  abstract fetchMetrics(postIds: string[]): Promise<MetricData[]>
  abstract getAccountStats(): Promise<AccountStats>

  async sync(syncType: SyncType): Promise<SyncResult> {
    // 1. Create SyncLog, set account to "syncing"
    // 2. Call fetchPosts() → get PostData[]
    // 3. Upsert posts into DB (socialAccountId_postId unique key)
    // 4. Call fetchMetrics(externalPostIds) → get MetricData[]
    // 5. For each metric: lookup DB post by externalPostId, upsert PostMetric
    // 6. Call getAccountStats() → upsert AccountDailyRollup (with follower 0-protection)
    // 7. Update SyncLog and SocialAccount status
    // Error handling: fail ratio > 50% → status "failed", otherwise "success"
  }

  protected sanitizeText(text: string | null, maxLength = 500): string | null
  protected async delay(ms: number): Promise<void>
}
```

**Key Design Decisions**:
- No Redis/Bull dependency — uses Prisma as the job queue
- `fetchMetrics` takes an array of **external** post IDs (not DB UUIDs)
- Follower count protection: if extraction returns 0 but previous value was non-zero, the previous value is carried forward
- Text sanitization removes control characters, hex escapes, and non-BMP characters for PostgreSQL compatibility

#### YouTube Collector (lib/collectors/youtube.ts)

**API**: YouTube Data API v3 (via `googleapis` npm package)

**Authentication**: API Key (per-account or global `YOUTUBE_API_KEY` env var, encrypted in DB)

**Endpoints Used**:
- `youtube.search.list()` — Find all uploads from channel (paginated, ordered by date)
- `youtube.videos.list()` with `part=statistics,contentDetails` — Get metrics + duration for Short detection

**Content Types**: Regular videos, Shorts (auto-detected via duration + URL probe)

**Metrics Collected**: Views, Likes, Comments

**Collection Strategy**:
1. `fetchPosts()`: Paginate through channel uploads via `search.list()`, extract video ID, title, description, thumbnail, published date
2. `fetchMetrics(postIds)`: Batch video IDs in groups of 50 (YouTube API max per request), call `videos.list()` with `statistics` + `contentDetails`
3. **Shorts Detection**: Videos with duration ≤ 180s are candidates. Confirmed via URL probe to `youtube.com/shorts/{videoId}` (302 redirect = Short). Post type and content URL updated accordingly.
4. Account stats: Channel subscriber count via `youtube.channels.list()`

**Rate Limits**:
- 10,000 units/day (free quota)
- 100ms delay between batches
- Batch size: 50 videos per request (very efficient)

**Speed**: ~100ms per 50 videos — the fastest collector by far

#### X/Twitter Collector (lib/collectors/twitter.ts)

**Approach**: Playwright web scraping with stored session cookies (no paid API tier required, $0/month)

**Authentication**: Session cookies stored encrypted in the `cookieData` field of `SocialAccount`. Loaded into Playwright browser context via `browser-cookies.ts` utility. Cookies validated and checked for expiration before use.

**Data Sources**:
- Profile page timeline: Scroll and extract posts via `extractPostsFromTimeline()`
- GraphQL TweetDetail API: Primary method for per-post metrics via `extractMetricsFromGraphQL()`
- DOM fallback: `extractMetricsFromPost()` if GraphQL returns empty
- Profile stats: `extractProfileStats()` via `listenForProfileGraphQL()` network interception

**Metrics Collected**: Views, Likes, Shares (retweets), Comments (replies), Bookmarks

**Collection Strategy**:
1. `fetchPosts()`: Open profile page, scroll to load recent posts, extract from timeline DOM (up to `MAX_POSTS_PER_SYNC = 100`)
2. `fetchMetrics(postIds)`: For each post, navigate to post URL, extract metrics from GraphQL response. Falls back to DOM scraping if GraphQL is empty.
3. `getAccountStats()`: Extract follower/following counts from profile page GraphQL response

**Rate Limiting**:
- 3s base delay + up to 2s random between page loads (`PAGE_LOAD_DELAY = 3000`)
- Random user agent rotation via `getRandomUserAgent()`
- Sequential processing (no parallel page loads)

**Speed**: ~3-5s per post — the slowest collector

**Cookie Management**: Cookies are stored in the DB as a JSON string or Netscape cookie format. The `browser-cookies.ts` utility handles parsing, validation (checks for required cookies like `auth_token`, `ct0`), and expiration checking.

#### Instagram Collector (lib/collectors/instagram.ts)

**Approach**: Playwright with Instagram's internal REST API (`/api/v1/feed/user/`) — no Facebook Business Account or Graph API required

**Authentication**: Session cookies stored encrypted in `cookieData` field. Required cookies: `sessionid`, `csrftoken`. Loaded into Playwright browser context.

**Data Sources**:
- Internal REST API: `fetchAllInstagramPosts()` via `instagram-scraper.ts` — calls `/api/v1/feed/user/{userId}/` with `x-ig-app-id: 936619743392459` header
- User ID resolution: `resolveInstagramUserId()` from profile page
- Profile stats: `fetchInstagramProfile()` for follower counts

**Metrics Collected**: Likes, Comments, Views/Plays (for video/reel content)

**Content Types**: Images (postType: "image"), Videos/Reels (postType: "video"), Carousels (postType: "carousel")

**Collection Strategy**:
1. `fetchPosts()`: Uses Instagram REST API to paginate through all posts (up to `MAX_POSTS_PER_SYNC = 200`). Metrics are **cached in-memory** during this step.
2. `fetchMetrics(postIds)`: Returns cached metrics from `fetchPosts()` — no additional scraping. This means `fetchMetrics()` must be called AFTER `fetchPosts()` to have data.
3. `getAccountStats()`: Extracts follower/following/post counts from profile page

**Important**: Instagram's `fetchMetrics()` is purely cache-based. For the Full Metric Refresh feature, `fetchPosts()` is called first to populate the cache, then `fetchMetrics()` returns cached data for recently fetched posts. Older posts that aren't in the latest fetch won't get updated.

**Rate Limits**: 2s delay between API pages. Random user agent rotation.

#### TikTok Collector (lib/collectors/tiktok.ts)

**Approach**: Playwright with `__UNIVERSAL_DATA_FOR_REHYDRATION__` hydration data parsing + per-video page fallback

**Architecture**: TikTok scraping runs in two modes:
1. **Server-side collector** (on DigitalOcean): Standard collector pattern, used for manual syncs
2. **Remote scraper** (on MacBook): Standalone script at `scripts/tiktok-remote-scraper/` that scrapes and pushes data to `/api/sync/ingest`. This is the primary method since TikTok's anti-bot is very aggressive and works better from a residential IP.

**Authentication**: Optional session cookies stored in `cookieData`. Works without cookies for basic profile scraping.

**Data Sources**:
- Profile page hydration data: `__UNIVERSAL_DATA_FOR_REHYDRATION__` script tag contains all video data in JSON
- Per-video page fallback: `extractMetricsFromPage()` for uncached videos
- Profile stats: `extractProfileStats()` from profile page

**Metrics Collected** (via hydration data or page scraping):
- View count
- Like count
- Comment count
- Share count
- Follower count

**Collection Strategy**:
1. `fetchPosts()`: Navigate to profile page, scroll to load videos, extract from DOM via `extractVideosFromDOM()`. Hydration data cached in `metricsCache` for fast metric retrieval (up to `MAX_VIDEOS_PER_SYNC = 100`)
2. `fetchMetrics(postIds)`: Check `metricsCache` first (populated during `fetchPosts()`). For uncached IDs, fall back to per-video page loads with `extractMetricsFromPage()`
3. `getAccountStats()`: Extract follower/following/video counts from profile page

**Rate Limiting**: 3s base delay + up to 2s random between page loads. Random user agent rotation.

**Speed**: Cached posts are instant; uncached posts are ~3-5s each (Playwright page loads)

**Remote Scraper** (`scripts/tiktok-remote-scraper/`):
- Standalone TypeScript script running on a MacBook
- Configured via `.env` file: `API_TOKEN`, `TIKTOK_USERNAMES`, `MAX_VIDEOS`
- Scrapes TikTok profiles and pushes results to the server's `/api/sync/ingest` endpoint
- Runs manually or via cron from the MacBook
- Uses residential IP to avoid TikTok's aggressive anti-bot detection

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

### Current Deployment: DigitalOcean Droplet

> **Note**: The application is currently deployed and running on a DigitalOcean Droplet. App Platform was considered but not used due to the need for Playwright (headless browser) and SSH access.

### DigitalOcean Droplet (Current Setup)

**Pros**:
- Full control, lower cost
- Can run custom background jobs easily
- SSH access for debugging
- Full Node.js + PostgreSQL setup

**Cons**:
- Need to manage server, backups, updates
- Responsible for security hardening

**Current Server**: `164.92.195.12` (SSH: `ssh root@164.92.195.12`)
**Domain**: `social.clutch.game`
**App Path**: `/root/clutch-social`
**PM2 App Name**: `clutch-social`
**GitHub Repo**: `SundenGroup/social-tracker` (main branch)
**No auto-deploy** — must SSH and run manually after pushing to GitHub

**Deploy Command**:
```bash
ssh root@164.92.195.12 'cd /root/clutch-social && git pull origin main && npm ci --production=false && npx prisma generate && npm run build && pm2 restart clutch-social'
```

**Setup Steps** (for reference):
1. Create Droplet (2GB RAM, 2vCPU recommended)
   - OS: Ubuntu 22.04 LTS
   - Size: $18/month (5GB SSD, 2GB RAM, 2vCPU)

2. Initial setup:
   ```bash
   # SSH into droplet
   ssh root@164.92.195.12

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

### Environment Variables

```
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/social_tracker"

# NextAuth
NEXTAUTH_SECRET="<generate with openssl rand -base64 32>"
NEXTAUTH_URL="https://social.clutch.game"
AUTH_SECRET="<same as NEXTAUTH_SECRET for NextAuth v5>"

# YouTube
YOUTUBE_API_KEY="<from Google Cloud Console>"

# Encryption (for API keys and cookies stored in DB)
ENCRYPTION_KEY="<32-byte hex key for AES encryption>"

# Email (for password reset, notifications)
SMTP_FROM="noreply@social.clutch.game"
SMTP_HOST="<SMTP host>"
SMTP_PORT=587
SMTP_USER="<SMTP username>"
SMTP_PASSWORD="<SMTP password>"

# Sync
CRON_SECRET_TOKEN="<random token for cron auth — used by /api/sync/trigger>"

# App
NODE_ENV="production"
```

**Note**: X/Twitter, Instagram, and TikTok credentials (session cookies) are stored encrypted in the `cookieData` field of each `SocialAccount` record in the database, not in environment variables. Only YouTube uses an API key (stored in env or per-account in DB).

**TikTok Remote Scraper** (`scripts/tiktok-remote-scraper/.env`):
```
API_TOKEN="<matches server's ingest endpoint token>"
TIKTOK_USERNAMES="username1,username2"
MAX_VIDEOS=50
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

## Current Status: FULLY DEPLOYED AND OPERATIONAL

The application is live at `social.clutch.game`, deployed on a DigitalOcean Droplet with automated daily syncs via cron at 2 AM UTC.

## Key Architectural Decisions (As Implemented)

1. **Data Model**: Normalized schema with separate PostMetric table for cumulative metric snapshots. Profiles group accounts across platforms. Posts support isSponsored and isTrending flags. Organizations support hideSponsored setting.
2. **Metric Queries**: Uses `DISTINCT ON` PostgreSQL query pattern (`lib/metrics-helper.ts`) to efficiently fetch only the latest metric per post per type, avoiding loading all historical snapshots.
3. **Collection**: YouTube via Data API v3 (free tier, batched 50/request); X/Twitter via Playwright + GraphQL scraping ($0/month); Instagram via Playwright + internal REST API with session cookies; TikTok via Playwright hydration data parsing (remote scraper from MacBook pushes via `/api/sync/ingest`).
4. **Authentication**: NextAuth.js v5 with JWT sessions, bcrypt password hashing, role-based access (admin/viewer).
5. **Job Queue**: Prisma-based queue (no Redis/Bull dependency) — SyncLog table serves as the job queue with 3 retries and exponential backoff.
6. **Deployment**: DigitalOcean Droplet (`164.92.195.12`) with Nginx reverse proxy, PM2 process manager, SSL via Certbot. Manual deploy via SSH + git pull.
7. **Frontend**: Next.js 16 App Router with Tailwind CSS 4, Recharts 3 for visualization. Content type tabs (All/Video/Short-form/Long-form/Image) on all dashboards. Global profile selector. Period comparison with overlay charts.
8. **Admin Tools**: Full Metric Refresh with live progress tracking (elapsed time, ETA, per-account status). Sync monitoring with failure alerts.

## Features Implemented

| Feature | Status | Key Files |
|---------|--------|-----------|
| Authentication (login, register, password reset) | Complete | `lib/auth.ts`, `app/(auth)/` |
| Account management (CRUD, test connection) | Complete | `app/api/accounts/`, `app/(dashboard)/accounts/` |
| Profile management (grouping accounts) | Complete | `app/api/profiles/`, `components/providers/ProfileProvider.tsx` |
| YouTube collector (API-based) | Complete | `lib/collectors/youtube.ts` |
| Twitter/X collector (Playwright) | Complete | `lib/collectors/twitter.ts`, `lib/utils/twitter-scraper.ts` |
| Instagram collector (Playwright + REST API) | Complete | `lib/collectors/instagram.ts`, `lib/utils/instagram-scraper.ts` |
| TikTok collector (Playwright + hydration) | Complete | `lib/collectors/tiktok.ts`, `scripts/tiktok-remote-scraper/` |
| Dashboard overview with KPIs | Complete | `app/(dashboard)/page.tsx`, `app/api/metrics/dashboard/route.ts` |
| Per-platform dashboards (4 platforms) | Complete | `app/(dashboard)/platforms/*/page.tsx` |
| Cross-platform comparison | Complete | `app/(dashboard)/comparison/page.tsx` |
| Period-vs-period comparison | Complete | `app/(dashboard)/period-comparison/page.tsx` |
| CSV/Excel export | Complete | `app/api/exports/csv/route.ts`, `app/api/exports/xlsx/route.ts` |
| Data import (Excel/CSV) | Complete | `app/(dashboard)/import/page.tsx`, `app/api/posts/import/route.ts` |
| User management (admin/viewer roles) | Complete | `app/(dashboard)/users/`, `app/api/users/` |
| Settings & sync monitoring | Complete | `app/(dashboard)/settings/page.tsx` |
| Full metric refresh (admin) | Complete | `app/api/admin/full-refresh/route.ts` |
| Sponsored post filtering | Complete | `components/tables/SponsoredToggle.tsx`, org `hideSponsored` setting |
| Automated daily sync (cron) | Complete | `app/api/sync/trigger/route.ts`, server cron at 2 AM UTC |
| Remote TikTok ingestion | Complete | `app/api/sync/ingest/route.ts`, `scripts/tiktok-remote-scraper/` |

## Critical Success Factors

1. **Data Accuracy**: Collectors validate data integrity; text sanitization prevents PostgreSQL encoding errors; follower count 0-protection prevents data loss from failed extractions
2. **Performance**: `DISTINCT ON` SQL queries for latest metrics; no eager-loading of all metric snapshots; proper database indexes
3. **Reliability**: 3-retry with exponential backoff; sync failure alerts on Settings page; comprehensive SyncLog audit trail
4. **Security**: Encrypted API credentials and cookies (`lib/api-keys.ts`); JWT sessions; role-based access control; input validation with Zod
5. **User Experience**: Responsive Tailwind CSS design; loading states; content type tabs; profile selector; date range pickers; live progress tracking for admin operations

---

### Critical Files Reference

**Core Infrastructure**:
- `prisma/schema.prisma` — Core data model; any schema changes ripple through entire app
- `lib/auth.ts` — Authentication foundation; all protected routes depend on this
- `lib/api-handler.ts` — API route wrapper; handles auth, error catching, response formatting
- `lib/db.ts` — Prisma client singleton
- `middleware.ts` — Route protection; controls access to all dashboard features

**Data Collection**:
- `lib/collectors/base-collector.ts` — Abstract pattern for all collectors; defines sync() flow
- `lib/collectors/youtube.ts` — YouTube Data API v3 (fastest collector)
- `lib/collectors/twitter.ts` — Playwright + GraphQL (slowest collector)
- `lib/collectors/instagram.ts` — Playwright + internal REST API (cache-based metrics)
- `lib/collectors/tiktok.ts` — Playwright + hydration data (hybrid cache + per-video)
- `lib/workers/sync-worker.ts` — Prisma-based job queue; handles retry logic
- `lib/metrics-helper.ts` — `DISTINCT ON` SQL for efficient latest-metric queries

**Dashboards & API**:
- `app/(dashboard)/layout.tsx` — Dashboard frame with sidebar
- `app/(dashboard)/page.tsx` — Main overview dashboard
- `app/api/metrics/dashboard/route.ts` — Primary dashboard data endpoint
- `app/api/metrics/platform/[platform]/route.ts` — Platform-specific metrics
- `app/api/metrics/comparison/route.ts` — Cross-platform comparison
- `app/api/metrics/period-comparison/route.ts` — Period-vs-period comparison
- `app/api/admin/full-refresh/route.ts` — Admin metric refresh with progress tracking

**Key Components**:
- `components/layouts/Sidebar.tsx` — Navigation structure
- `components/cards/KPICard.tsx` — Reusable KPI display with trend indicators
- `components/common/ProfileSelector.tsx` — Global profile filter
- `components/providers/ProfileProvider.tsx` — Profile context across all pages
- `hooks/useProfiles.ts` — Profile selection state management