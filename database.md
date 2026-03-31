# Database details

## Overview

This schema stores YouTube channel analytics data collected via the YouTube Data API v3 and YouTube Analytics API v2. It supports:
- Multiple users, each connecting one or more YouTube channels
- Full video catalog with content type classification (Shorts vs Long vs Live)
- Daily per-video metrics (views, engagement, subscribers, watch time)
- Traffic source breakdown per video per day
- Device/platform breakdown per video per day
- Geographic breakdown per video per day
- Audience retention curves per video (one-time snapshot)
- Live stream minute-by-minute concurrent viewer timelines

Data is collected via a backfill (max possible days of history) and then kept current with daily incremental syncs.

## Tables

### youtube_channel

Connects a user to their YouTube channel. OAuth is handled externally (Arcade.dev) — no tokens stored.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| user_id | string (FK → user) | App user who owns this connection |
| channel_id | string (unique) | YouTube channel ID, e.g. `UCsSxkIlOhS4u-4BZnyRDwlQ` |
| channel_title | string | Display name |
| channel_thumbnail | string? | URL to channel avatar |
| custom_url | string? | e.g. `@ArcadeAI` |
| last_sync_at | datetime? | Last successful sync timestamp |
| last_sync_status | string? | `"success"`, `"error"`, etc. |
| last_sync_error | string? | Error message if last sync failed |
| backfill_completed | boolean (default false) | Whether initial 730-day import is done |
| backfill_start_date | datetime? | Earliest date backfilled |
| created_at | datetime | |
| updated_at | datetime | |

**Indexes**: `user_id`

---

### video

Every video uploaded to a connected channel. Includes content type classification derived from YouTube Data API `fileDetails` (owner-only access).

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| channel_id | string (FK → youtube_channel) | |
| video_id | string (unique) | YouTube video ID, e.g. `sHo_SruY6Dk` |
| title | string | |
| description | text? | |
| thumbnail_url | string? | |
| published_at | datetime | |
| duration | int? | Duration in seconds |
| tags | string[] | |
| category_id | string? | YouTube category ID |
| live_broadcast_content | string? | `"none"`, `"live"`, `"upcoming"` |
| content_type | string? | `"SHORTS"`, `"NORMAL"`, or `"LIVE"` |
| width | int? | Video width in pixels (from fileDetails) |
| height | int? | Video height in pixels (from fileDetails) |
| aspect_ratio | float? | height / width. Shorts ≈ 1.778 (9:16), Normal ≈ 0.562 (16:9) |
| current_views | bigint (default 0) | Snapshot of total views at last sync |
| current_likes | int (default 0) | Snapshot of total likes at last sync |
| current_comments | int (default 0) | Snapshot of total comments at last sync |
| created_at | datetime | |
| updated_at | datetime | |

**Indexes**: `channel_id`, `published_at`, `content_type`

**Content type classification rules** (YouTube's official Shorts criteria):
- `SHORTS`: duration ≤ 180s AND aspect ratio 1.6–1.9 (vertical 9:16)
- `LIVE`: `live_broadcast_content == "live"`
- `NORMAL`: everything else

---

### video_daily_stats

One row per video per day. Core engagement and performance metrics.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| video_id | string (FK → video) | |
| date | date | |
| views | bigint (default 0) | |
| estimated_minutes_watched | bigint? | Total watch time in minutes |
| average_view_duration | int? | In seconds |
| average_view_percentage | float? | 0–100 scale |
| likes | int? | |
| comments | int? | |
| shares | int? | |
| videos_added_to_playlists | int? | |
| videos_removed_from_playlists | int? | |
| subscribers_gained | int? | Subs gained from this video on this day |
| subscribers_lost | int? | Subs lost from this video on this day |
| engaged_views | bigint? | Shorts-specific: views with meaningful engagement |
| red_views | bigint? | YouTube Premium views |
| estimated_red_minutes_watched | bigint? | YouTube Premium watch time |
| card_impressions | bigint? | |
| card_clicks | bigint? | |
| card_click_rate | float? | |
| card_teaser_impressions | bigint? | |
| card_teaser_clicks | bigint? | |
| card_teaser_click_rate | float? | |
| average_concurrent_viewers | int? | Live streams only |
| peak_concurrent_viewers | int? | Live streams only |
| metadata | json? | Extensibility field |
| created_at | datetime | |
| updated_at | datetime | |

**Unique constraint**: `(video_id, date)`
**Indexes**: `(video_id, date)`, `date`

**API note**: Impressions (`videoThumbnailImpressions`) are NOT available with `dimensions="video,day"` — this is a YouTube API limitation. Impressions can only be queried per-video aggregate (no daily) or channel daily (no per-video).

---

### video_traffic_source_stats

One row per video per day per traffic source type. Shows where views came from.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| video_id | string (FK → video) | |
| date | date | |
| traffic_source_type | string | See values below |
| traffic_source_detail | string? | Specific referrer (optional) |
| views | bigint (default 0) | |
| estimated_minutes_watched | bigint? | |
| created_at | datetime | |
| updated_at | datetime | |

**Unique constraint**: `(video_id, date, traffic_source_type, traffic_source_detail)`
**Indexes**: `(video_id, date)`, `traffic_source_type`

**Traffic source types** observed in real data:
`ADVERTISING`, `BROWSE_FEATURES`, `CAMPAIGN_CARD`, `END_SCREEN`, `EXT_URL`, `HASHTAGS`, `NOTIFICATION`, `NO_LINK_EMBEDDED`, `NO_LINK_OTHER`, `PLAYLIST`, `PROMOTED`, `RELATED_VIDEO`, `SEARCH`, `SHORTS`, `SUBSCRIBER`, `VIDEO_REMIXES`, `YT_CHANNEL`, `YT_OTHER_PAGE`, `YT_PLAYLIST_PAGE`, `YT_SEARCH`

---

### video_device_stats

One row per video per day per device type. Shows what devices viewers used.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| video_id | string (FK → video) | |
| date | date | |
| device_type | string | See values below |
| operating_system | string? | `ANDROID`, `IOS`, `WINDOWS`, etc. (optional) |
| views | bigint (default 0) | |
| estimated_minutes_watched | bigint? | |
| average_view_duration | int? | In seconds |
| created_at | datetime | |
| updated_at | datetime | |

**Unique constraint**: `(video_id, date, device_type, operating_system)`
**Indexes**: `(video_id, date)`, `device_type`

**Device types**: `DESKTOP`, `MOBILE`, `TABLET`, `TV`, `GAME_CONSOLE`, `UNKNOWN_PLATFORM`

---

### video_geography_stats

One row per video per day per country. Shows geographic distribution.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| video_id | string (FK → video) | |
| date | date | |
| country | string | Two-letter ISO country code (e.g. `US`, `GB`, `IN`) |
| views | bigint (default 0) | |
| estimated_minutes_watched | bigint? | |
| subscribers_gained | int? | |
| created_at | datetime | |
| updated_at | datetime | |

**Unique constraint**: `(video_id, date, country)`
**Indexes**: `(video_id, date)`, `country`

**API note**: `dimensions="video,day,country"` may not be supported. If so, query with `dimensions="video,country"` (aggregate over date range) instead. Consider limiting to top 10 markets (`US,GB,CA,AU,IN,DE,FR,BR,MX,JP`) to reduce data volume.

---

### video_retention

Audience retention curve — one snapshot per video (not daily). Shows what percentage of viewers are still watching at each point in the video.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| video_id | string (FK → video) | |
| elapsed_ratio | float | Position in video: 0.01 = 1%, 0.50 = 50%, 1.00 = 100% |
| audience_watch_ratio | float | Can exceed 1.0 if viewers rewatch segments |
| relative_retention_performance | float? | 0–1 scale comparing to similar-length videos |
| calculated_at | datetime | When this snapshot was taken |

**Unique constraint**: `(video_id, elapsed_ratio)`
**Indexes**: `video_id`

**API note**: Retention cannot be batched — must query one video at a time.

---

### live_stream_timeline

Minute-by-minute concurrent viewer data for live streams only.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| video_id | string (FK → video) | |
| livestream_position | int | Minute offset from stream start (1, 2, 3, ...) |
| average_concurrent_viewers | int? | |
| peak_concurrent_viewers | int? | |
| created_at | datetime | |

**Unique constraint**: `(video_id, livestream_position)`
**Indexes**: `video_id`

**API note**: Cannot be batched — must query one live stream at a time.

---

### channel_daily_stats

Daily channel-level aggregate metrics (not per-video).

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| channel_id | string (FK → youtube_channel) | |
| date | date | |
| subscriber_count | int? | Total subscribers (must be computed — API only gives gains/losses) |
| total_views | bigint | Cumulative channel views |
| total_videos | int | Total video count |
| subscribers_gained | int? | |
| subscribers_lost | int? | |
| views_gained | bigint? | Views gained on this day |
| estimated_minutes_watched | bigint? | |
| average_view_duration | int? | |
| metadata | json? | |
| created_at | datetime | |
| updated_at | datetime | |

**Unique constraint**: `(channel_id, date)`
**Indexes**: `(channel_id, date)`, `date`

---

## Relationships

```
User 1──* YouTubeChannel 1──* Video 1──* VideoDailyStats
                         │              ├──* VideoTrafficSourceStats
                         │              ├──* VideoDeviceStats
                         │              ├──* VideoGeographyStats
                         │              ├──* VideoRetention
                         │              └──* LiveStreamTimeline
                         └──* ChannelDailyStats
```

## API Query Patterns

- **Video discovery**: YouTube Data API v3, `videos.list` with `part=snippet,contentDetails,statistics,fileDetails`, batched 50 per request
- **Daily metrics**: YouTube Analytics API v2, `dimensions="video,day"`, batched 200 videos per request, date range chunked to 180-day windows
- **Traffic/Device**: Same pattern as daily metrics but with added dimension (`insightTrafficSourceType` or `deviceType`)
- **Retention**: One video at a time, `dimensions="elapsedVideoTimeRatio"`
- **Live timeline**: One video at a time, `dimensions="livestreamPosition"`


## Influencer / External Channel Tracking

### Overview

This section covers tracking YouTube channels you do **not** own — influencers, competitors, or partners. These tables are separate from the owned-channel tables above because the available data is fundamentally different.

**Key constraint**: The YouTube Analytics API (`yt-analytics.readonly`) only works for channels you own (`ids="channel==MINE"`). For external channels, only the public YouTube Data API v3 is available:

| Data | Owned channels | External channels |
|---|---|---|
| Channel metadata (title, thumbnail, subscriber count) | Yes | Yes |
| Video metadata (title, duration, publish date) | Yes | Yes |
| Current view/like/comment counts | Yes | Yes (snapshot only) |
| Content type via fileDetails (width/height) | Yes (99% accuracy) | No — duration-only heuristic (~85%) |
| Daily views/engagement time-series | Yes (Analytics API) | No |
| Traffic sources, devices, geography | Yes (Analytics API) | No |
| Audience retention, subscriber impact | Yes (Analytics API) | No |
| Watch time, avg view duration/percentage | Yes (Analytics API) | No |

**Strategy**: Since we cannot get time-series from the API for external channels, we **poll daily and store snapshots** of public stats. Deltas (daily growth) are derived from consecutive snapshots.

---

### Tables

#### tracked_channel

An external YouTube channel that a user monitors. No OAuth or channel ownership needed — uses public Data API only.

Separate from `youtube_channel` (owned) because the sync semantics, available metrics, and relationship chains are fundamentally different. Combining them would require nullable fields and conditional logic everywhere.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| user_id | string (FK → user) | App user who is tracking this channel |
| channel_id | string | YouTube channel ID, e.g. `UCxxxxx` |
| channel_title | string | Display name |
| channel_thumbnail | string? | URL to channel avatar |
| custom_url | string? | e.g. `@influencer` |
| description | text? | Channel description |
| country | string? | Channel-level country if public |
| is_active | boolean (default true) | User can pause tracking |
| last_polled_at | datetime? | Last successful data fetch |
| last_poll_error | string? | Error message if last poll failed |
| notes | text? | User annotation / free-text notes |
| created_at | datetime | |
| updated_at | datetime | |

**Unique constraint**: `(user_id, channel_id)` — a user tracks a given channel only once
**Indexes**: `user_id`, `channel_id`

---

#### tracked_channel_snapshot

Daily snapshot of a tracked channel's public metrics. Since the Data API only returns current counts, we poll daily and store point-in-time readings. Deltas (growth rates) are computed at query time from consecutive snapshots.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| channel_id | string (FK → tracked_channel) | |
| date | date | |
| subscriber_count | int? | Null if channel hides subscriber count |
| total_views | bigint | Cumulative lifetime views |
| video_count | int | Total public video count |
| subscriber_count_hidden | boolean (default false) | Whether the channel hides its sub count |
| created_at | datetime | |

**Unique constraint**: `(channel_id, date)`
**Indexes**: `(channel_id, date)`, `date`

---

#### tracked_video

A video from a tracked (external) channel. Separate from `video` (owned channels) because there is no access to `fileDetails` (owner-only), no Analytics API data, and a different relationship chain.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| channel_id | string (FK → tracked_channel) | |
| video_id | string (unique) | YouTube video ID |
| title | string | |
| description | text? | |
| thumbnail_url | string? | |
| published_at | datetime | |
| duration | int? | Duration in seconds |
| tags | string[] | |
| category_id | string? | YouTube category ID |
| live_broadcast_content | string? | `"none"`, `"live"`, `"upcoming"` |
| content_type | string? | `"SHORTS"`, `"NORMAL"`, or `"LIVE"` (estimated) |
| created_at | datetime | |
| updated_at | datetime | |

**Indexes**: `channel_id`, `published_at`, `content_type`

**Content type classification**: Without `fileDetails` access, classification uses duration only (≤180s → likely SHORTS). This is less accurate (~85%) than owned-channel classification (~99% with aspect ratio). No `width`/`height`/`aspect_ratio` fields — they are not available for external channels.

---

#### tracked_video_snapshot

Daily snapshot of a tracked video's public stats. This is the core data source for engagement computation. Only captures what the public Data API exposes: current totals at poll time.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| video_id | string (FK → tracked_video) | |
| date | date | |
| view_count | bigint (default 0) | Total views at time of poll |
| like_count | int (default 0) | Total likes at time of poll |
| comment_count | int (default 0) | Total comments at time of poll |
| views_delta | bigint? | view_count minus previous day's view_count |
| likes_delta | int? | like_count minus previous day's like_count |
| comments_delta | int? | comment_count minus previous day's comment_count |
| created_at | datetime | |

**Unique constraint**: `(video_id, date)`
**Indexes**: `(video_id, date)`, `date`

**Delta fields**: Optional pre-computed deltas avoid expensive window queries on large datasets. They are populated during the polling job at zero additional API cost by comparing against the previous snapshot. Can also be computed at query time if not stored.

---

#### channel_engagement_score

Computed engagement score for a tracked channel over a time period. Formula-agnostic — this table stores results only. Raw inputs come from `tracked_channel_snapshot` + `tracked_video_snapshot`.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| channel_id | string (FK → tracked_channel) | |
| date | date | The date this score represents |
| period_type | string | `"daily"`, `"weekly"`, or `"monthly"` |
| period_start | date | Start of the scoring window |
| period_end | date | End of the scoring window |
| score | float | The computed engagement score (raw) |
| score_normalized | float? | Optional 0–100 normalized score |
| formula_version | string | e.g. `"v1"`, `"v2.1"` |
| formula_name | string? | Human-readable name, e.g. `"base_engagement"` |
| input_data | json? | Inputs that produced this score, for auditability |
| metadata | json? | Extensibility |
| created_at | datetime | |

**Unique constraint**: `(channel_id, date, period_type, formula_version)`
**Indexes**: `(channel_id, date)`, `(channel_id, period_type)`, `formula_version`

**Formula versioning**: When a formula changes, old scores remain intact and new scores are computed alongside under a new `formula_version`. This supports recomputation, A/B comparison of formulas, and historical auditability.

---

#### brand

A company or brand that sponsors videos on tracked channels. Stored as its own model (not a string field) for referential integrity, consistent naming, and the ability to query "all sponsorships for Brand X" without string matching.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| user_id | string (FK → user) | User who manages this brand |
| name | string | e.g. `"Acme Corp"` |
| logo_url | string? | |
| website | string? | |
| notes | text? | |
| created_at | datetime | |
| updated_at | datetime | |

**Unique constraint**: `(user_id, name)` — prevents duplicate brand names per user
**Indexes**: `user_id`

---

#### sponsored_video

Links a tracked video to a brand sponsorship. This is manually entered by the user — not from the YouTube API. Stores business metadata for ROI analysis.

| Column | Type | Notes |
|---|---|---|
| id | cuid (PK) | |
| video_id | string (FK → tracked_video) | The sponsored video |
| brand_id | string (FK → brand) | The sponsoring brand |
| campaign_name | string? | e.g. `"Q1 2026 Product Launch"` |
| payment_amount | float? | Amount paid for sponsorship |
| payment_currency | string? (default `"USD"`) | ISO 4217 currency code |
| sponsorship_type | string? | `"dedicated"`, `"integrated"`, `"mention"`, `"affiliate"` |
| contracted_at | datetime? | When the deal was signed |
| expected_release_at | datetime? | When video was supposed to go live |
| actual_release_at | datetime? | When it actually went live (can differ) |
| deliverables | text? | Free-text description of what was agreed |
| notes | text? | |
| metadata | json? | Extensibility |
| created_at | datetime | |
| updated_at | datetime | |

**Unique constraint**: `(video_id, brand_id, campaign_name)` — a video can be sponsored by the same brand across different campaigns
**Indexes**: `video_id`, `brand_id`, `campaign_name`

**Sponsorship types**:
- `dedicated` — entire video is about the sponsor's product
- `integrated` — sponsor segment within a larger video
- `mention` — brief verbal/visual mention
- `affiliate` — affiliate link in description, commission-based

---

### Relationships (Full System)

Owned channels (full Analytics API access):
```
User 1──* YouTubeChannel 1──* Video 1──* VideoDailyStats
                         │              ├──* VideoTrafficSourceStats
                         │              ├──* VideoDeviceStats
                         │              ├──* VideoGeographyStats
                         │              ├──* VideoRetention
                         │              └──* LiveStreamTimeline
                         └──* ChannelDailyStats
```

Tracked/external channels (public Data API only):
```
User 1──* TrackedChannel 1──* TrackedVideo 1──* TrackedVideoSnapshot
     │              │                  │
     │              │                  └──* SponsoredVideo
     │              │
     │              ├──* TrackedChannelSnapshot
     │              └──* ChannelEngagementScore
     │
     └──* Brand 1──* SponsoredVideo
```

---

## Data Volume Estimates (tracked channels)

For a user tracking 50 influencer channels, each with ~200 videos, polling daily:

| Table | Estimate | Notes |
|---|---|---|
| tracked_channel | 50 rows | One per tracked channel |
| tracked_channel_snapshot | ~18K rows/year | 50 channels x 365 days |
| tracked_video | ~10K rows | 50 channels x 200 videos |
| tracked_video_snapshot | ~3.6M rows/year | 10K videos x 365 days (worst case) |
| channel_engagement_score | ~55K rows/year | 50 channels x 365 days x 3 period types |
| brand | ~10–50 rows | Manual entry, small volume |
| sponsored_video | ~100–500 rows | Manual entry, small volume |

**Optimization**: In practice, only snapshot videos published in the last 90–180 days (most engagement happens early). Sponsored videos are always snapshotted regardless of age. This reduces `tracked_video_snapshot` volume significantly.

## API Query Patterns (tracked channels)

- **Channel metadata**: YouTube Data API v3, `channels.list` with `part=snippet,statistics`, no auth required (API key only)
- **Video discovery**: `playlistItems.list` (uploads playlist) + `videos.list` with `part=snippet,contentDetails,statistics`, batched 50 per request
- **Snapshot polling**: Same `videos.list` call captures current view/like/comment counts — no additional API cost beyond discovery
- **No Analytics API**: Traffic sources, watch time, retention, device/geography data are NOT available for external channels
