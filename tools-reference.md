# YouTube Metrics MCP Tools Reference

Complete catalog of Arcade MCP tools exposed by the `yt_metrics` server. Tools are organized by use case and data access level.

**Toolkit name**: `YtMetrics`
**Tool naming**: PascalCase (e.g. `YtMetrics.GetMyChannel`)
**Parameter naming**: snake_case (must match Python function signatures — Arcade does NOT convert)

**Two auth mechanisms** coexist in this server:

| Auth | Arcade decorator | Scopes / Secrets | Used by |
|---|---|---|---|
| **Google OAuth** | `requires_auth=Google(scopes=[...])` | `youtube.readonly` + `yt-analytics.readonly` | Owned channel tools (#1–17) |
| **API key** | `requires_secrets=["YOUTUBE_API_KEY"]` | YouTube Data API key (stored as Arcade secret) | Public/tracked channel tools (#18–23) |

---

## Table of Contents

1. [Owned Channel Tools](#1-owned-channel-tools) (require channel ownership)
   - [1A. Channel Discovery](#1a-channel-discovery)
   - [1B. Channel Analytics](#1b-channel-analytics)
   - [1C. Video Analytics (single query)](#1c-video-analytics-single-query)
   - [1D. Video Analytics (backfill)](#1d-video-analytics-backfill--chunked--retries)
   - [1E. Content Classification](#1e-content-classification)
   - [1F. Removed Tools](#1f-removed-tools)
2. [Public / Tracked Channel Tools](#2-public--tracked-channel-tools) (work on any channel)

---

# 1. Owned Channel Tools

These tools require the authenticated user to **own** the channel. They use the YouTube Analytics API (`ids="channel==MINE"`) and/or owner-only Data API parts (`fileDetails`).

**Auth**: `requires_auth=Google(scopes=YOUTUBE_SCOPES)`
**Scopes**:
- `https://www.googleapis.com/auth/youtube.readonly` — read channel/video data, including owner-only `fileDetails`
- `https://www.googleapis.com/auth/yt-analytics.readonly` — read analytics (views, engagement, traffic, devices, etc.)

## 1A. Channel Discovery

### `get_my_channel`

Get the authenticated user's YouTube channel details.

**API**: YouTube Data API v3 (`channels.list`, `mine=True`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`

| Parameter | Type | Required | Description |
|---|---|---|---|
| *(none)* | | | Uses authenticated user's channel |

**Returns**: `dict`

```json
{
  "channelId": "UCsSxkIlOhS4u-4BZnyRDwlQ",
  "title": "Arcade AI",
  "description": "...",
  "thumbnail": "https://yt3.ggpht.com/...",
  "customUrl": "@ArcadeAI",
  "subscriberCount": 5200,
  "viewCount": 150000,
  "videoCount": 212
}
```

---

### `list_channel_videos`

List videos from an owned channel with current statistics and content classification. Single page — use `page_token` for pagination.

**API**: YouTube Data API v3 (`playlistItems.list` + `videos.list` with `part=snippet,contentDetails,statistics,fileDetails`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| channel_id | str | yes | | YouTube channel ID |
| max_results | int | no | 50 | Results per page (max 50) |
| page_token | str | no | None | Pagination token from previous response |

**Returns**: `dict`

```json
{
  "videos": [
    {
      "videoId": "sHo_SruY6Dk",
      "title": "Web MCP and GitHub's $60M AI Bet",
      "description": "...",
      "publishedAt": "2026-02-26T18:00:56Z",
      "thumbnailUrl": "https://i.ytimg.com/vi/...",
      "duration": 2684,
      "tags": ["AI", "MCP", "agents"],
      "categoryId": "28",
      "liveBroadcastContent": "none",
      "currentViews": 58,
      "currentLikes": 3,
      "currentComments": 0,
      "contentType": "NORMAL",
      "width": 1920,
      "height": 1080,
      "aspectRatio": 0.5625
    }
  ],
  "nextPageToken": "CDIQAA"
}
```

---

### `discover_all_videos`

Discover ALL videos from an owned channel with automatic pagination. Returns every video with metadata, content type classification, and current stats. Use as Step 1 of a backfill.

**API**: YouTube Data API v3 (paginated `playlistItems.list` + batched `videos.list` with `fileDetails`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`
**Retry**: Exponential backoff on 500 errors

| Parameter | Type | Required | Description |
|---|---|---|---|
| channel_id | str | yes | YouTube channel ID |

**Returns**: `dict`

```json
{
  "channelId": "UCsSxkIlOhS4u-4BZnyRDwlQ",
  "totalVideosReported": 215,
  "totalVideosDiscovered": 212,
  "contentTypeCounts": {
    "SHORTS": 45,
    "NORMAL": 160,
    "LIVE": 7
  },
  "videos": [
    {
      "videoId": "sHo_SruY6Dk",
      "title": "...",
      "description": "...",
      "publishedAt": "2026-02-26T18:00:56Z",
      "thumbnailUrl": "https://...",
      "duration": 2684,
      "tags": ["AI", "MCP"],
      "categoryId": "28",
      "liveBroadcastContent": "none",
      "contentType": "NORMAL",
      "width": 1920,
      "height": 1080,
      "aspectRatio": 0.5625,
      "currentViews": 58,
      "currentLikes": 3,
      "currentComments": 0
    }
  ]
}
```

**Batch limits**: Paginates at 50 video IDs per playlist page, fetches details in batches of 50.

---

## 1B. Channel Analytics

### `get_channel_analytics`

Get daily channel-level analytics for a date range. Returns aggregate metrics (not per-video).

**API**: YouTube Analytics API v2 (`dimensions="day"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`

| Parameter | Type | Required | Description |
|---|---|---|---|
| channel_id | str | yes | YouTube channel ID |
| start_date | str | yes | `YYYY-MM-DD` format |
| end_date | str | yes | `YYYY-MM-DD` format |

**Returns**: `list[dict]`

```json
[
  {
    "date": "2026-03-01",
    "subscribersGained": 12,
    "subscribersLost": 2,
    "subscriberCount": 0,
    "views": 1500,
    "estimatedMinutesWatched": 3200,
    "averageViewDuration": 128
  }
]
```

**Note**: `subscriberCount` is a placeholder (always 0). The Analytics API only provides gains/losses — total count must be computed from a known baseline + cumulative deltas. Data has a 2–3 day lag.

---

## 1C. Video Analytics (single query)

These tools fetch analytics for a single date range without chunking. Suitable for short ranges (< 180 days) or when the caller handles chunking.

### `get_video_analytics`

Get daily analytics for a single video.

**API**: YouTube Analytics API v2 (`dimensions="day"`, `filters="video==<id>"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`

| Parameter | Type | Required | Description |
|---|---|---|---|
| video_id | str | yes | YouTube video ID |
| start_date | str | yes | `YYYY-MM-DD` |
| end_date | str | yes | `YYYY-MM-DD` |

**Returns**: `list[dict]`

```json
[
  {
    "date": "2026-03-01",
    "views": 45,
    "estimatedMinutesWatched": 120,
    "averageViewDuration": 160,
    "impressions": null,
    "impressionClickThroughRate": null,
    "likes": 3,
    "comments": 1,
    "averageViewPercentage": 42.5
  }
]
```

**Note**: Impressions fields are always null when using `video,day` dimensions (YouTube API limitation). They are included for backward compatibility but will never contain data at daily per-video granularity.

---

### `get_multiple_video_analytics`

Get daily analytics for multiple videos in a single request. Similar to `get_video_analytics` but batched.

**API**: YouTube Analytics API v2 (`dimensions="video,day"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`

| Parameter | Type | Required | Description |
|---|---|---|---|
| video_ids | list[str] | yes | YouTube video IDs |
| start_date | str | yes | `YYYY-MM-DD` |
| end_date | str | yes | `YYYY-MM-DD` |

**Returns**: `dict[str, list[dict]]` — maps video ID to daily stats array (same shape as `get_video_analytics`)

---

### `get_batch_video_comprehensive_analytics`

Get ALL available daily metrics for up to 200 videos. The most complete single-query analytics tool.

**API**: YouTube Analytics API v2 (`dimensions="video,day"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`
**Batch limit**: 200 videos

| Parameter | Type | Required | Description |
|---|---|---|---|
| video_ids | list[str] | yes | Up to 200 video IDs |
| start_date | str | yes | `YYYY-MM-DD` |
| end_date | str | yes | `YYYY-MM-DD` |

**Returns**: `dict[str, list[dict]]`

```json
{
  "sHo_SruY6Dk": [
    {
      "date": "2026-03-01",
      "views": 45,
      "estimatedMinutesWatched": 120,
      "averageViewDuration": 160,
      "averageViewPercentage": 42.5,
      "likes": 3,
      "comments": 1,
      "shares": 2,
      "videosAddedToPlaylists": 1,
      "videosRemovedFromPlaylists": 0,
      "subscribersGained": 1,
      "subscribersLost": 0,
      "engagedViews": 30,
      "redViews": 5,
      "estimatedRedMinutesWatched": 12,
      "cardImpressions": 100,
      "cardClicks": 3,
      "cardClickRate": 0.03,
      "cardTeaserImpressions": 95,
      "cardTeaserClicks": 5,
      "cardTeaserClickRate": 0.053,
      "averageConcurrentViewers": null,
      "peakConcurrentViewers": null
    }
  ]
}
```

**Metrics included**: views, estimatedMinutesWatched, averageViewDuration, averageViewPercentage, likes, comments, shares, videosAddedToPlaylists, videosRemovedFromPlaylists, subscribersGained, subscribersLost, engagedViews, redViews, estimatedRedMinutesWatched, cardImpressions, cardClicks, cardClickRate, cardTeaserImpressions, cardTeaserClicks, cardTeaserClickRate, averageConcurrentViewers, peakConcurrentViewers

---

### `get_batch_video_traffic_sources`

Get traffic source breakdown for up to 200 videos with daily granularity.

**API**: YouTube Analytics API v2 (`dimensions="video,day,insightTrafficSourceType"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`
**Batch limit**: 200 videos

| Parameter | Type | Required | Description |
|---|---|---|---|
| video_ids | list[str] | yes | Up to 200 video IDs |
| start_date | str | yes | `YYYY-MM-DD` |
| end_date | str | yes | `YYYY-MM-DD` |

**Returns**: `dict[str, list[dict]]`

```json
{
  "sHo_SruY6Dk": [
    {
      "date": "2026-03-01",
      "trafficSourceType": "BROWSE_FEATURES",
      "views": 20,
      "estimatedMinutesWatched": 45
    },
    {
      "date": "2026-03-01",
      "trafficSourceType": "SEARCH",
      "views": 12,
      "estimatedMinutesWatched": 30
    }
  ]
}
```

**Traffic source types**: `ADVERTISING`, `BROWSE_FEATURES`, `CAMPAIGN_CARD`, `END_SCREEN`, `EXT_URL`, `HASHTAGS`, `NOTIFICATION`, `NO_LINK_EMBEDDED`, `NO_LINK_OTHER`, `PLAYLIST`, `PROMOTED`, `RELATED_VIDEO`, `SEARCH`, `SHORTS`, `SUBSCRIBER`, `VIDEO_REMIXES`, `YT_CHANNEL`, `YT_OTHER_PAGE`, `YT_PLAYLIST_PAGE`, `YT_SEARCH`

---

### `get_batch_video_device_stats`

Get device/platform breakdown for up to 200 videos with daily granularity.

**API**: YouTube Analytics API v2 (`dimensions="video,day,deviceType"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`
**Batch limit**: 200 videos

| Parameter | Type | Required | Description |
|---|---|---|---|
| video_ids | list[str] | yes | Up to 200 video IDs |
| start_date | str | yes | `YYYY-MM-DD` |
| end_date | str | yes | `YYYY-MM-DD` |

**Returns**: `dict[str, list[dict]]`

```json
{
  "sHo_SruY6Dk": [
    {
      "date": "2026-03-01",
      "deviceType": "MOBILE",
      "views": 25,
      "estimatedMinutesWatched": 50,
      "averageViewDuration": 120
    }
  ]
}
```

**Device types**: `DESKTOP`, `MOBILE`, `TABLET`, `TV`, `GAME_CONSOLE`, `UNKNOWN_PLATFORM`

---

### `get_batch_video_geography_stats`

Get geographic breakdown for up to 100 videos with daily granularity.

**API**: YouTube Analytics API v2 (`dimensions="video,day,country"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`
**Batch limit**: 100 videos (lower than other batch tools due to country dimension cardinality)

| Parameter | Type | Required | Description |
|---|---|---|---|
| video_ids | list[str] | yes | Up to 100 video IDs |
| start_date | str | yes | `YYYY-MM-DD` |
| end_date | str | yes | `YYYY-MM-DD` |
| top_countries_only | bool | no (default True) | Limit to top 10 markets: US, GB, CA, AU, IN, DE, FR, BR, MX, JP |

**Returns**: `dict[str, list[dict]]`

```json
{
  "sHo_SruY6Dk": [
    {
      "date": "2026-03-01",
      "country": "US",
      "views": 30,
      "estimatedMinutesWatched": 65,
      "subscribersGained": 1
    }
  ]
}
```

**Note**: `dimensions="video,day,country"` may return a 400 error on some channels. If so, fall back to `dimensions="video,country"` (aggregate over date range, no daily granularity).

---

### `get_video_retention_curve`

Get audience retention curve for a single video. Returns data points from 0% to 100% of video duration. One-time snapshot, not daily.

**API**: YouTube Analytics API v2 (`dimensions="elapsedVideoTimeRatio"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`
**Batch limit**: 1 video (cannot be batched — API limitation)

| Parameter | Type | Required | Description |
|---|---|---|---|
| video_id | str | yes | YouTube video ID |
| start_date | str | yes | `YYYY-MM-DD` (recommend last 90 days) |
| end_date | str | yes | `YYYY-MM-DD` |

**Returns**: `list[dict]`

```json
[
  { "elapsedRatio": 0.01, "audienceWatchRatio": 1.0, "relativeRetentionPerformance": 0.85 },
  { "elapsedRatio": 0.25, "audienceWatchRatio": 0.72, "relativeRetentionPerformance": 0.60 },
  { "elapsedRatio": 0.50, "audienceWatchRatio": 0.45, "relativeRetentionPerformance": 0.40 },
  { "elapsedRatio": 1.00, "audienceWatchRatio": 0.15, "relativeRetentionPerformance": 0.20 }
]
```

- `audienceWatchRatio`: Can exceed 1.0 if viewers rewatch segments
- `relativeRetentionPerformance`: 0–1 scale vs similar-length videos

---

### `get_live_stream_timeline`

Get minute-by-minute concurrent viewer data for a live stream.

**API**: YouTube Analytics API v2 (`dimensions="livestreamPosition"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`
**Batch limit**: 1 video (cannot be batched)

| Parameter | Type | Required | Description |
|---|---|---|---|
| video_id | str | yes | YouTube video ID (must be a live stream) |
| stream_date | str | yes | `YYYY-MM-DD` (date the stream aired) |

**Returns**: `list[dict]`

```json
[
  { "livestreamPosition": 1, "averageConcurrentViewers": 45, "peakConcurrentViewers": 52 },
  { "livestreamPosition": 2, "averageConcurrentViewers": 78, "peakConcurrentViewers": 85 },
  { "livestreamPosition": 60, "averageConcurrentViewers": 120, "peakConcurrentViewers": 145 }
]
```

---

## 1D. Video Analytics (backfill — chunked + retries)

These tools handle large date ranges by splitting into chunks and retrying on server errors. Use for full backfills (365+ days) and incremental updates (7 days). Same data as the single-query tools, but with built-in resilience.

### `backfill_video_analytics`

Collect daily video analytics with date chunking and retries. Splits into two queries per chunk (core metrics + subscriber impact) for reliability.

**API**: YouTube Analytics API v2 (`dimensions="video,day"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`
**Retry**: Exponential backoff on 500 errors, skips 400 errors
**Batching**: 200 videos per query, date range chunked

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| video_ids | list[str] | yes | | Video IDs (any count — auto-batched at 200) |
| start_date | str | yes | | `YYYY-MM-DD` |
| end_date | str | yes | | `YYYY-MM-DD` |
| chunk_days | int | no | 180 | Days per date chunk |

**Returns**: `dict`

```json
{
  "data": {
    "sHo_SruY6Dk": [
      {
        "date": "2026-03-01",
        "views": 45,
        "estimatedMinutesWatched": 120,
        "averageViewDuration": 160,
        "averageViewPercentage": 42.5,
        "likes": 3,
        "comments": 1,
        "shares": 2,
        "videosAddedToPlaylists": 1,
        "videosRemovedFromPlaylists": 0,
        "subscribersGained": 1,
        "subscribersLost": 0
      }
    ]
  },
  "metadata": {
    "videosRequested": 212,
    "videosWithData": 199,
    "dateRange": { "start": "2024-03-01", "end": "2026-03-01" },
    "dateChunks": 4,
    "videoBatches": 2,
    "errors": null
  }
}
```

**Metrics**: views, estimatedMinutesWatched, averageViewDuration, averageViewPercentage, likes, comments, shares, videosAddedToPlaylists, videosRemovedFromPlaylists, subscribersGained, subscribersLost

---

### `backfill_video_traffic_sources`

Collect daily traffic source breakdown with date chunking and retries.

**API**: YouTube Analytics API v2 (`dimensions="video,day,insightTrafficSourceType"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`
**Retry**: Exponential backoff on 500 errors
**Batching**: 200 videos per query, date range chunked

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| video_ids | list[str] | yes | | Video IDs |
| start_date | str | yes | | `YYYY-MM-DD` |
| end_date | str | yes | | `YYYY-MM-DD` |
| chunk_days | int | no | 180 | Days per date chunk |

**Returns**: `dict` — same wrapper as `backfill_video_analytics` with `data` (video_id → traffic rows) and `metadata`

Each row: `{ date, trafficSourceType, views, estimatedMinutesWatched }`

---

### `backfill_video_device_stats`

Collect daily device/platform breakdown with date chunking and retries.

**API**: YouTube Analytics API v2 (`dimensions="video,day,deviceType"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`
**Retry**: Exponential backoff on 500 errors
**Batching**: 200 videos per query, date range chunked

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| video_ids | list[str] | yes | | Video IDs |
| start_date | str | yes | | `YYYY-MM-DD` |
| end_date | str | yes | | `YYYY-MM-DD` |
| chunk_days | int | no | 180 | Days per date chunk |

**Returns**: `dict` — same wrapper with `data` (video_id → device rows) and `metadata`

Each row: `{ date, deviceType, views, estimatedMinutesWatched, averageViewDuration }`

---

### `backfill_video_geography_stats` *(NOT YET IMPLEMENTED)*

Collect daily geographic breakdown with date chunking and retries. Should follow the same pattern as the other backfill tools.

**API**: YouTube Analytics API v2 (`dimensions="video,day,country"`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`
**Batch limit**: 100 videos per query (lower than other backfill tools)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| video_ids | list[str] | yes | | Video IDs |
| start_date | str | yes | | `YYYY-MM-DD` |
| end_date | str | yes | | `YYYY-MM-DD` |
| chunk_days | int | no | 180 | Days per date chunk |
| top_countries_only | bool | no | True | Limit to top 10 markets |

**Returns**: `dict` — same wrapper with `data` (video_id → geography rows) and `metadata`

Each row: `{ date, country, views, estimatedMinutesWatched, subscribersGained }`

---

## 1E. Content Classification

### `get_content_type_classification`

Classify content type (SHORTS, NORMAL, LIVE) for up to 50 videos using `fileDetails` (owner-only).

**API**: YouTube Data API v3 (`videos.list` with `part=snippet,contentDetails,fileDetails`)
**Auth**: Google OAuth — scopes: `youtube.readonly`, `yt-analytics.readonly`
**Batch limit**: 50 videos

| Parameter | Type | Required | Description |
|---|---|---|---|
| video_ids | list[str] | yes | Up to 50 video IDs |

**Returns**: `dict[str, dict]`

```json
{
  "sHo_SruY6Dk": {
    "contentType": "NORMAL",
    "width": 1920,
    "height": 1080,
    "aspectRatio": 0.5625,
    "duration": 2684
  },
  "ntH-62rwuzs": {
    "contentType": "SHORTS",
    "width": 1080,
    "height": 1920,
    "aspectRatio": 1.778,
    "duration": 62
  }
}
```

**Classification rules** (YouTube's official Shorts criteria, ~99% accuracy):
- `SHORTS`: duration <= 180s AND aspect ratio 1.6–1.9 (vertical 9:16)
- `LIVE`: `liveBroadcastContent == "live"`
- `NORMAL`: everything else

Videos not found in the response are returned with `contentType: "UNKNOWN"` and null dimensions.

---

## 1F. Removed Tools

### ~~`get_batch_video_impressions_analytics`~~ **REMOVED**

**Status**: Intentionally removed. The TypeScript client (`arcade-youtube.ts`) still references `GetBatchVideoImpressionsAnalytics`, but the Python MCP server no longer implements it.

**Reason**: YouTube Analytics API does NOT support `videoThumbnailImpressions` with `dimensions="video,day"` — returns a 400 error. Impressions can only be queried:
- Per video aggregate (no daily granularity): `dimensions="video"`
- Channel daily (no per-video): `dimensions="day"`

Neither format fits the per-video-per-day schema. The TypeScript client wrapper should be removed.

---
---

# 2. Public / Tracked Channel Tools

These tools work on **any public YouTube channel** — no ownership required. They use only the YouTube Data API v3 with publicly accessible parts (`snippet`, `contentDetails`, `statistics`). The Analytics API is NOT used.

Use these for the influencer/external channel tracking system.

**Authentication**: Unlike owned-channel tools (which use Google OAuth via Arcade), public tools use a **YouTube API key** via Arcade secret management (`requires_secrets=["YOUTUBE_API_KEY"]`). No user-specific OAuth flow is needed — the API key provides access to all public YouTube data.

**Channel resolution**: Public tools accept either a YouTube channel ID (e.g. `UCsSxkIlOhS4u-4BZnyRDwlQ`) or a handle (e.g. `@ArcadeAI` or `ArcadeAI`). The server resolves handles automatically via `channels.list(forHandle=...)`.

## 2A. Implemented Tools

These tools are already implemented (originally in the `youtube_screen` server, to be merged into the unified `yt_metrics` server).

### `list_public_channel_videos`

List recent videos from any public channel with current stats. Supports pagination and date filtering.

**API**: YouTube Data API v3 (`channels.list` + `playlistItems.list` + `videos.list` with `part=statistics`)
**Auth**: API key via Arcade secret — `requires_secrets=["YOUTUBE_API_KEY"]` (no OAuth scopes)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| channel_id_or_handle | str | yes | | Channel ID (e.g. `UCxxxxx`) or handle (e.g. `@ArcadeAI`) |
| num_videos | int | no | 10 | Number of videos to return |
| date | str \| None | no | None | ISO date (e.g. `2025-01-15`). Only videos published on/after this date. |
| next_page_token | str \| None | no | None | Pagination token from previous response |

**Returns**: `dict`

```json
{
  "videos": [
    {
      "video_id": "sHo_SruY6Dk",
      "title": "Web MCP and GitHub's $60M AI Bet",
      "description": "...",
      "published_at": "2026-02-26T18:00:56Z",
      "thumbnail": "https://i.ytimg.com/vi/sHo_SruY6Dk/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=sHo_SruY6Dk",
      "views": 58,
      "likes": 3,
      "comments": 0
    }
  ],
  "next_page_token": "CDIQAA"
}
```

**Key differences from owned-channel `list_channel_videos`**:
- Accepts handles (`@ArcadeAI`), not just channel IDs
- Uses API key, not OAuth
- No `fileDetails` → no `contentType`, `width`, `height`, `aspectRatio`
- No `duration`, `tags`, `categoryId`, `liveBroadcastContent`
- Returns `url` field (YouTube watch link)
- Uses `num_videos` parameter (not `max_results`) with date-based early termination

**Note**: `next_page_token` is only present when more results are available. If a `date` filter is provided and the playlist reaches videos older than that date, pagination stops (no token returned).

---

### `score_channel`

Calculate an engagement score for any public channel based on recent video performance relative to subscriber count.

**API**: YouTube Data API v3 (`channels.list` with `part=contentDetails,statistics` + same video fetching as `list_public_channel_videos`)
**Auth**: API key via Arcade secret — `requires_secrets=["YOUTUBE_API_KEY"]` (no OAuth scopes)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| channel_id_or_handle | str | yes | | Channel ID or handle |
| num_videos | int | no | 10 | Number of recent videos to analyze |
| date | str \| None | no | None | ISO date filter — only score videos published on/after this date |

**Returns**: `dict`

```json
{
  "channel": "@ArcadeAI",
  "subscriber_count": 5200,
  "videos_analyzed": 8,
  "engagement_score": 0.012345,
  "average_views": 450.50,
  "average_likes": 12.25,
  "average_comments": 2.75
}
```

**Engagement score formula**:

```
For each video (excluding those with 0 views):
  rate = (0.8 * views + 0.2 * 0.5 * (likes/views + comments/views)) / subscriber_count

engagement_score = mean(rate for all scored videos)
```

The formula weights raw view volume (80%) and engagement ratios (20%), normalized by subscriber count. Higher scores indicate stronger engagement relative to audience size.

**Error cases**:
- Raises `ValueError` if channel has 0 subscribers (division by zero)
- Raises `ValueError` if no videos found matching criteria
- Raises `ValueError` if all matched videos have 0 views
- Videos with 0 views are excluded from the score but not from the query

**Note**: `videos_analyzed` may be less than `num_videos` if some videos have 0 views. The score is computed only from videos that have views.

---

## 2B. Not Yet Implemented

These tools are designed but not yet coded. They complete the tracked channel system.

### `search_channels` *(NOT YET IMPLEMENTED)*

Search for YouTube channels by keyword. Use for the "add channel to track" discovery flow.

**API**: YouTube Data API v3 (`search.list` with `type=channel`)
**Auth**: API key via Arcade secret — `requires_secrets=["YOUTUBE_API_KEY"]` (no OAuth scopes)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| query | str | yes | | Search query (channel name, topic, etc.) |
| max_results | int | no | 10 | Number of results (max 50) |

**Returns**: `list[dict]`

```json
[
  {
    "channelId": "UCsSxkIlOhS4u-4BZnyRDwlQ",
    "title": "Arcade AI",
    "description": "Building the auth layer for AI agents...",
    "thumbnail": "https://yt3.ggpht.com/..."
  }
]
```

**Note**: Search results include a channel snippet but NOT full statistics. A follow-up call to `get_public_channel_info` is needed for subscriber/view counts. Search API calls cost **100 quota units** each (vs 1 unit for most other calls) — use sparingly.

---

### `get_public_channel_info` *(NOT YET IMPLEMENTED)*

Get public metadata and statistics for any YouTube channel. No ownership required. Use for initial channel tracking setup and daily channel-level snapshots.

**API**: YouTube Data API v3 (`channels.list` with `part=snippet,statistics,brandingSettings`)
**Auth**: API key via Arcade secret — `requires_secrets=["YOUTUBE_API_KEY"]` (no OAuth scopes)

| Parameter | Type | Required | Description |
|---|---|---|---|
| channel_id_or_handle | str | yes | Channel ID or handle |

**Returns**: `dict`

```json
{
  "channelId": "UCsSxkIlOhS4u-4BZnyRDwlQ",
  "title": "Arcade AI",
  "description": "Building the auth layer for AI agents...",
  "thumbnail": "https://yt3.ggpht.com/...",
  "customUrl": "@ArcadeAI",
  "country": "US",
  "subscriberCount": 5200,
  "subscriberCountHidden": false,
  "viewCount": 150000,
  "videoCount": 212,
  "publishedAt": "2022-06-15T00:00:00Z"
}
```

**Note**: `subscriberCount` is null and `subscriberCountHidden` is true when the channel hides its subscriber count. `viewCount` and `videoCount` are always public.

---

### `discover_all_public_videos` *(NOT YET IMPLEMENTED)*

Discover ALL videos from any public channel with automatic pagination. Same auto-pagination pattern as `discover_all_videos` (owned) but without `fileDetails`.

**API**: YouTube Data API v3 (paginated `playlistItems.list` + batched `videos.list` with `part=snippet,contentDetails,statistics`)
**Auth**: API key via Arcade secret — `requires_secrets=["YOUTUBE_API_KEY"]` (no OAuth scopes)
**Retry**: Exponential backoff on 500 errors

| Parameter | Type | Required | Description |
|---|---|---|---|
| channel_id_or_handle | str | yes | Channel ID or handle |

**Returns**: `dict`

```json
{
  "channelId": "UCsSxkIlOhS4u-4BZnyRDwlQ",
  "totalVideosReported": 215,
  "totalVideosDiscovered": 212,
  "contentTypeCounts": {
    "SHORTS": 40,
    "NORMAL": 165,
    "LIVE": 7
  },
  "videos": [
    {
      "videoId": "sHo_SruY6Dk",
      "title": "Web MCP and GitHub's $60M AI Bet",
      "description": "...",
      "publishedAt": "2026-02-26T18:00:56Z",
      "thumbnailUrl": "https://...",
      "duration": 2684,
      "tags": ["AI", "MCP"],
      "categoryId": "28",
      "liveBroadcastContent": "none",
      "contentType": "NORMAL",
      "currentViews": 58,
      "currentLikes": 3,
      "currentComments": 0
    }
  ]
}
```

**Content type classification** (duration-only heuristic, ~85% accuracy):
- `SHORTS`: duration <= 180s (no aspect ratio confirmation — `fileDetails` is owner-only)
- `LIVE`: `liveBroadcastContent == "live"`
- `NORMAL`: everything else

**Key differences from owned-channel `discover_all_videos`**:
- No `width`, `height`, `aspectRatio` fields
- Lower content type accuracy (~85% vs ~99%)
- Accepts handles, not just channel IDs
- Uses API key, not OAuth

**Batch limits**: Paginates at 50 video IDs per playlist page, fetches details in batches of 50.

---

### `get_public_video_stats` *(NOT YET IMPLEMENTED)*

Batch fetch current public statistics for any videos. Use for daily snapshot polling of tracked videos. Minimal API call (`part=statistics` only) to conserve quota during frequent polling.

**API**: YouTube Data API v3 (`videos.list` with `part=statistics`)
**Auth**: API key via Arcade secret — `requires_secrets=["YOUTUBE_API_KEY"]` (no OAuth scopes)
**Batch limit**: 50 videos per request (YouTube API limit for `videos.list`)

| Parameter | Type | Required | Description |
|---|---|---|---|
| video_ids | list[str] | yes | Up to 50 video IDs |

**Returns**: `dict[str, dict]`

```json
{
  "sHo_SruY6Dk": {
    "videoId": "sHo_SruY6Dk",
    "viewCount": 58,
    "likeCount": 3,
    "commentCount": 0
  },
  "ntH-62rwuzs": {
    "videoId": "ntH-62rwuzs",
    "viewCount": 73,
    "likeCount": 1,
    "commentCount": 0
  }
}
```

Videos not found (private, deleted) are omitted from the response. The caller should compare the response keys against the input list to detect missing videos.

**Note**: Intentionally fetches `part=statistics` only to minimize quota usage. If metadata is also needed (title changes, etc.), use `list_public_channel_videos` or `discover_all_public_videos` instead.

### `get_public_video_transcription` *(NOT YET IMPLEMENTED)*

Fetch the available transcription or transcribe the video

**Auth**: API key via Arcade secret — `requires_secrets=["YOUTUBE_API_KEY"]` (no OAuth scopes)

| Parameter | Type | Required | Description |
|---|---|---|---|
| video_ids | list[str] | yes | Up to 10 video IDs |

**Returns**: `dict[str, dict]`

```json
{
  "sHo_SruY6Dk": {
    "videoId": "sHo_SruY6Dk",
    "transcription": "..."
  },
  "ntH-62rwuzs": {
    "videoId": "ntH-62rwuzs",
    "transcription": "..."
  }
}
```

Videos that don't have a transcription will be downloaded and passed to OpenAI's speech-to-text model and saved to a file

**Note**: This tool will be used for owned videos as well.

**Note**: Intentionally fetches `part=statistics` only to minimize quota usage. If metadata is also needed (title changes, etc.), use `list_public_channel_videos` or `discover_all_public_videos` instead.
---
---

# Tool Summary

## Owned channel tools (16 implemented + 1 gap)

| # | Tool | API | Auth | Batch | Status |
|---|---|---|---|---|---|
| 1 | `get_my_channel` | Data v3 | OAuth | 1 channel | Implemented |
| 2 | `get_channel_analytics` | Analytics v2 | OAuth | 1 channel | Implemented |
| 3 | `list_channel_videos` | Data v3 | OAuth | 50/page | Implemented |
| 4 | `discover_all_videos` | Data v3 | OAuth | auto-paginate | Implemented |
| 5 | `get_video_analytics` | Analytics v2 | OAuth | 1 video | Implemented |
| 6 | `get_multiple_video_analytics` | Analytics v2 | OAuth | unbounded | Implemented |
| 7 | `get_batch_video_comprehensive_analytics` | Analytics v2 | OAuth | 200 videos | Implemented |
| 8 | `get_batch_video_traffic_sources` | Analytics v2 | OAuth | 200 videos | Implemented |
| 9 | `get_batch_video_device_stats` | Analytics v2 | OAuth | 200 videos | Implemented |
| 10 | `get_batch_video_geography_stats` | Analytics v2 | OAuth | 100 videos | Implemented |
| 11 | `get_video_retention_curve` | Analytics v2 | OAuth | 1 video | Implemented |
| 12 | `get_live_stream_timeline` | Analytics v2 | OAuth | 1 video | Implemented |
| 13 | `get_content_type_classification` | Data v3 | OAuth | 50 videos | Implemented |
| 14 | `backfill_video_analytics` | Analytics v2 | OAuth | 200/chunk | Implemented |
| 15 | `backfill_video_traffic_sources` | Analytics v2 | OAuth | 200/chunk | Implemented |
| 16 | `backfill_video_device_stats` | Analytics v2 | OAuth | 200/chunk | Implemented |
| 17 | `backfill_video_geography_stats` | Analytics v2 | OAuth | 100/chunk | **Not yet implemented** |
| ~~ | ~~`get_batch_video_impressions_analytics`~~ | | | | **Removed** (API limitation) |

## Public / tracked channel tools (2 implemented + 4 not yet)

| # | Tool | API | Auth | Batch | Status |
|---|---|---|---|---|---|
| 18 | `list_public_channel_videos` | Data v3 | API key | N per page | **Implemented** |
| 19 | `score_channel` | Data v3 | API key | N videos | **Implemented** |
| 20 | `search_channels` | Data v3 | API key | N/A | **Not yet implemented** |
| 21 | `get_public_channel_info` | Data v3 | API key | 1 channel | **Not yet implemented** |
| 22 | `discover_all_public_videos` | Data v3 | API key | auto-paginate | **Not yet implemented** |
| 23 | `get_public_video_stats` | Data v3 | API key | 50 videos | **Not yet implemented** |

---

## Typical Workflows

### Owned channel backfill
```
1. get_my_channel                        → get channel ID
2. discover_all_videos(channel_id)       → get all video IDs + metadata
3. backfill_video_analytics(video_ids, start, end)
4. backfill_video_traffic_sources(video_ids, start, end)
5. backfill_video_device_stats(video_ids, start, end)
6. (optional) get_video_retention_curve(video_id, ...) per video
7. (optional) get_live_stream_timeline(video_id, ...) per live stream
```

### Owned channel daily sync
```
1. get_channel_analytics(channel_id, yesterday, yesterday)
2. list_channel_videos(channel_id)       → check for new videos
3. get_video_analytics(video_id, yesterday, yesterday) per video
   — or backfill_video_analytics(all_ids, yesterday, yesterday) for batch
```

### Score an influencer channel
```
1. score_channel("@influencer", num_videos=20)  → engagement score + averages
   — or with date filter: score_channel("@influencer", date="2026-01-01")
```

### Track a new external channel
```
1. search_channels("influencer name")              → find channel ID
2. get_public_channel_info(channel_id)             → store metadata + initial snapshot
3. discover_all_public_videos(channel_id)          → store all videos + initial stats
4. score_channel(channel_id, num_videos=20)        → compute initial engagement score
```

### Daily poll of tracked channels
```
1. get_public_channel_info(channel_id)             → store channel snapshot (subs, views, video count)
2. get_public_video_stats(video_ids)               → store video snapshots (views, likes, comments)
   — batch at 50 per call, poll only recent/sponsored videos for efficiency
3. score_channel(channel_id, num_videos=10, date=7_days_ago)  → store engagement score
4. (optional) list_public_channel_videos(channel_id, num_videos=5) → detect new uploads
```

## Authentication Summary

The merged server uses **two auth mechanisms** coexisting in the same Arcade MCP server:

| Auth method | Arcade decorator | Used by | How it works |
|---|---|---|---|
| **Google OAuth** | `requires_auth=Google(scopes=[...])` | Owned channel tools (#1–17) | User-specific OAuth flow via Arcade. Grants access to Analytics API and owner-only Data API parts (`fileDetails`). |
| **API key** | `requires_secrets=["YOUTUBE_API_KEY"]` | Public/tracked channel tools (#18–23) | Shared YouTube Data API key stored as an Arcade secret. No user-specific auth needed. Access limited to public data. |
