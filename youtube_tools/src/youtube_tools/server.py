#!/usr/bin/env python3
"""youtube_tools MCP server — YouTube Data & Analytics API integration via Arcade.dev

Combines two auth mechanisms in a single server:
- Google OAuth (requires_auth): For owned channel analytics (YouTube Analytics API)
- API key (requires_secrets): For public channel data (YouTube Data API v3)
"""

import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import isodate
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from arcade_mcp_server import Context, MCPApp
from arcade_mcp_server.auth import Google

app = MCPApp(name="youtube_tools", version="1.0.0", log_level="DEBUG")

# YouTube OAuth2 configuration (owned channel tools)
YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]


# =============================================================================
# Shared helpers
# =============================================================================


def _build_youtube_service(oauth_token: str, service_name: str = "youtube", version: str = "v3"):
    """Build a YouTube API service with OAuth token."""
    from google.oauth2.credentials import Credentials

    credentials = Credentials(token=oauth_token)
    return build(service_name, version, credentials=credentials)


def _build_youtube_service_with_key(api_key: str):
    """Build a YouTube Data API v3 service with an API key (public data only)."""
    return build("youtube", "v3", developerKey=api_key)


def _handle_youtube_error(error: HttpError) -> dict:
    """Convert YouTube API errors to structured error responses."""
    error_content = error.error_details if hasattr(error, "error_details") else str(error)

    if error.resp.status == 403:
        if "quotaExceeded" in str(error_content):
            return {"error": True, "code": "QUOTA_EXCEEDED", "message": "YouTube API quota exceeded"}
        return {
            "error": True,
            "code": "PERMISSION_DENIED",
            "message": "Permission denied to access this resource",
        }
    elif error.resp.status == 401:
        return {"error": True, "code": "AUTH_INVALID", "message": "OAuth tokens invalid or expired"}
    elif error.resp.status == 404:
        return {"error": True, "code": "NOT_FOUND", "message": "Channel or video not found"}
    else:
        return {"error": True, "code": "API_ERROR", "message": f"YouTube API error: {str(error_content)}"}


def _parse_duration_to_seconds(duration_str: str) -> int:
    """Parse ISO 8601 duration (PT10M30S) to seconds."""
    try:
        duration = isodate.parse_duration(duration_str)
        return int(duration.total_seconds())
    except Exception:
        return 0


def _classify_content_type(video: dict) -> tuple[str, int | None, int | None, float | None]:
    """Classify content type using YouTube's official criteria (owner-only, uses fileDetails).

    Returns: (contentType, width, height, aspectRatio)
    """
    snippet = video.get("snippet", {})
    content_details = video.get("contentDetails", {})
    file_details = video.get("fileDetails", {})

    if snippet.get("liveBroadcastContent") == "live":
        return ("LIVE", None, None, None)

    duration_seconds = _parse_duration_to_seconds(content_details.get("duration", "PT0S"))

    if duration_seconds > 0 and duration_seconds <= 180:
        video_streams = file_details.get("videoStreams", [])
        if video_streams:
            stream = video_streams[0]
            width = stream.get("widthPixels", 0)
            height = stream.get("heightPixels", 0)
            if width > 0 and height > 0:
                aspect_ratio = height / width
                if height > width and aspect_ratio >= 1.6 and aspect_ratio <= 1.9:
                    return ("SHORTS", width, height, aspect_ratio)

    video_streams = file_details.get("videoStreams", [])
    if video_streams:
        stream = video_streams[0]
        width = stream.get("widthPixels", 0)
        height = stream.get("heightPixels", 0)
        if width > 0 and height > 0:
            aspect_ratio = height / width
            return ("NORMAL", width, height, aspect_ratio)

    return ("NORMAL", None, None, None)


def _split_date_range(start_date: str, end_date: str, chunk_days: int = 180) -> list[tuple[str, str]]:
    """Split a date range into smaller chunks to avoid API limits."""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")

    chunks = []
    current = start

    while current <= end:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end)
        chunks.append((current.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d")))
        current = chunk_end + timedelta(days=1)

    return chunks


def _execute_with_retry(request, max_retries: int = 3):
    """Execute a YouTube API request with retry logic for server errors."""
    for attempt in range(max_retries):
        try:
            return request.execute()
        except HttpError as e:
            if attempt < max_retries - 1 and e.resp.status >= 500:
                time.sleep((2 ** attempt) * 0.5)
            else:
                raise


def _resolve_channel(youtube, channel_id_or_handle: str, parts: str = "contentDetails") -> dict:
    """Resolve a channel ID or handle to a channel resource (public API)."""
    channel_id_or_handle = channel_id_or_handle.strip()
    if channel_id_or_handle.startswith("UC") and len(channel_id_or_handle) == 24:
        request = youtube.channels().list(part=parts, id=channel_id_or_handle)
    else:
        handle = (
            channel_id_or_handle
            if channel_id_or_handle.startswith("@")
            else f"@{channel_id_or_handle}"
        )
        request = youtube.channels().list(part=parts, forHandle=handle)

    response = request.execute()
    items = response.get("items", [])
    if not items:
        raise ValueError(f"Channel not found: {channel_id_or_handle}")
    return items[0]


def _fetch_videos_with_stats(
    youtube,
    uploads_playlist_id: str,
    num_videos: int,
    date: str | None = None,
    page_token: str | None = None,
) -> dict:
    """Fetch videos from an uploads playlist with statistics (public API)."""
    date_filter = None
    if date:
        date_filter = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)

    videos: list[dict] = []
    hit_date_cutoff = False

    while len(videos) < num_videos:
        batch_size = min(50, num_videos - len(videos))
        request = youtube.playlistItems().list(
            part="snippet,contentDetails",
            playlistId=uploads_playlist_id,
            maxResults=batch_size,
            pageToken=page_token,
        )
        response = request.execute()

        for item in response.get("items", []):
            published_at_str = item["contentDetails"].get("videoPublishedAt")
            if not published_at_str:
                continue

            published_at = datetime.fromisoformat(published_at_str.replace("Z", "+00:00"))

            if date_filter and published_at < date_filter:
                hit_date_cutoff = True
                break

            videos.append({
                "video_id": item["contentDetails"]["videoId"],
                "title": item["snippet"]["title"],
                "description": item["snippet"]["description"],
                "published_at": published_at_str,
                "thumbnail": item["snippet"]["thumbnails"].get("high", {}).get("url"),
                "url": f"https://www.youtube.com/watch?v={item['contentDetails']['videoId']}",
            })

            if len(videos) >= num_videos:
                break

        if hit_date_cutoff:
            page_token = None
            break

        page_token = response.get("nextPageToken")
        if not page_token:
            break

    # Batch-fetch video statistics
    if videos:
        video_ids = [v["video_id"] for v in videos]
        stats_map: dict[str, dict] = {}

        for i in range(0, len(video_ids), 50):
            batch = video_ids[i : i + 50]
            request = youtube.videos().list(part="statistics", id=",".join(batch))
            resp = request.execute()
            for item in resp.get("items", []):
                s = item["statistics"]
                stats_map[item["id"]] = {
                    "views": int(s.get("viewCount", 0)),
                    "likes": int(s.get("likeCount", 0)),
                    "comments": int(s.get("commentCount", 0)),
                }

        for video in videos:
            stats = stats_map.get(video["video_id"], {})
            video["views"] = stats.get("views", 0)
            video["likes"] = stats.get("likes", 0)
            video["comments"] = stats.get("comments", 0)

    result: dict = {"videos": videos}
    if page_token:
        result["next_page_token"] = page_token
    return result


# =============================================================================
# OWNED CHANNEL TOOLS (Google OAuth)
# =============================================================================


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def get_my_channel(context: Context) -> dict:
    """Get the authenticated user's YouTube channel details.

    Returns channel information including ID, title, description, thumbnail,
    custom URL, subscriber count, view count, and video count.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return {"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}

        youtube = _build_youtube_service(oauth_token)

        request = youtube.channels().list(part="snippet,statistics,contentDetails", mine=True)
        response = request.execute()

        if not response.get("items"):
            return {
                "error": True,
                "code": "NOT_FOUND",
                "message": "No channel found for authenticated user",
            }

        channel = response["items"][0]
        snippet = channel.get("snippet", {})
        statistics = channel.get("statistics", {})

        return {
            "channelId": channel.get("id"),
            "title": snippet.get("title"),
            "description": snippet.get("description"),
            "thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url"),
            "customUrl": snippet.get("customUrl"),
            "subscriberCount": int(statistics.get("subscriberCount", 0)),
            "viewCount": int(statistics.get("viewCount", 0)),
            "videoCount": int(statistics.get("videoCount", 0)),
        }
    except HttpError as e:
        return _handle_youtube_error(e)
    except Exception as e:
        return {"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def get_channel_analytics(
    context: Context,
    channel_id: Annotated[str, "YouTube channel ID"],
    start_date: Annotated[str, "Start date in YYYY-MM-DD format"],
    end_date: Annotated[str, "End date in YYYY-MM-DD format"],
) -> list[dict]:
    """Get daily channel-level analytics for a date range.

    Returns daily statistics including subscriber gains/losses, views,
    estimated minutes watched, and average view duration.

    Note: YouTube Analytics API has a 2-3 day lag for data availability.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return [{"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}]

        youtube_analytics = _build_youtube_service(oauth_token, "youtubeAnalytics", "v2")

        request = youtube_analytics.reports().query(
            ids=f"channel=={channel_id}",
            startDate=start_date,
            endDate=end_date,
            metrics="subscribersGained,subscribersLost,views,estimatedMinutesWatched,averageViewDuration",
            dimensions="day",
            sort="day",
        )
        response = request.execute()

        results = []
        column_headers = response.get("columnHeaders", [])
        rows = response.get("rows", [])
        col_map = {header["name"]: idx for idx, header in enumerate(column_headers)}

        for row in rows:
            results.append({
                "date": row[col_map["day"]],
                "subscribersGained": int(row[col_map.get("subscribersGained", -1)] or 0),
                "subscribersLost": int(row[col_map.get("subscribersLost", -1)] or 0),
                "subscriberCount": 0,
                "views": int(row[col_map.get("views", -1)] or 0),
                "estimatedMinutesWatched": int(row[col_map.get("estimatedMinutesWatched", -1)] or 0),
                "averageViewDuration": int(row[col_map.get("averageViewDuration", -1)] or 0),
            })

        return results
    except HttpError as e:
        return [_handle_youtube_error(e)]
    except Exception as e:
        return [{"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}]


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def list_channel_videos(
    context: Context,
    channel_id: Annotated[str, "YouTube channel ID"],
    max_results: Annotated[Optional[int], "Number of results per page (default: 50, max: 50)"] = 50,
    page_token: Annotated[Optional[str], "Token for pagination"] = None,
) -> dict:
    """List videos from an owned channel with current statistics and content classification.

    Returns video metadata including title, description, publish date, duration,
    tags, content type (SHORTS/NORMAL/LIVE), dimensions, and current view/like/comment
    counts. Uses fileDetails for accurate classification (owner-only).
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return {"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}

        youtube = _build_youtube_service(oauth_token)

        channel_request = youtube.channels().list(part="contentDetails", id=channel_id)
        channel_response = channel_request.execute()

        if not channel_response.get("items"):
            return {"error": True, "code": "NOT_FOUND", "message": f"Channel {channel_id} not found"}

        uploads_playlist_id = channel_response["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

        playlist_request = youtube.playlistItems().list(
            part="snippet,contentDetails",
            playlistId=uploads_playlist_id,
            maxResults=min(max_results, 50),
            pageToken=page_token,
        )
        playlist_response = playlist_request.execute()

        video_ids = [item["contentDetails"]["videoId"] for item in playlist_response.get("items", [])]

        if not video_ids:
            return {"videos": [], "nextPageToken": None}

        videos_request = youtube.videos().list(
            part="snippet,contentDetails,statistics,fileDetails",
            id=",".join(video_ids),
        )
        videos_response = videos_request.execute()

        videos = []
        for video in videos_response.get("items", []):
            snippet = video.get("snippet", {})
            content_details = video.get("contentDetails", {})
            statistics = video.get("statistics", {})
            content_type, width, height, aspect_ratio = _classify_content_type(video)

            videos.append({
                "videoId": video.get("id"),
                "title": snippet.get("title"),
                "description": snippet.get("description"),
                "publishedAt": snippet.get("publishedAt"),
                "thumbnailUrl": snippet.get("thumbnails", {}).get("high", {}).get("url"),
                "duration": _parse_duration_to_seconds(content_details.get("duration", "PT0S")),
                "tags": snippet.get("tags", []),
                "categoryId": snippet.get("categoryId"),
                "liveBroadcastContent": snippet.get("liveBroadcastContent", "none"),
                "currentViews": int(statistics.get("viewCount", 0)),
                "currentLikes": int(statistics.get("likeCount", 0)),
                "currentComments": int(statistics.get("commentCount", 0)),
                "contentType": content_type,
                "width": width,
                "height": height,
                "aspectRatio": aspect_ratio,
            })

        return {"videos": videos, "nextPageToken": playlist_response.get("nextPageToken")}
    except HttpError as e:
        return _handle_youtube_error(e)
    except Exception as e:
        return {"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def get_video_analytics(
    context: Context,
    video_id: Annotated[str, "YouTube video ID"],
    start_date: Annotated[str, "Start date in YYYY-MM-DD format"],
    end_date: Annotated[str, "End date in YYYY-MM-DD format"],
) -> list[dict]:
    """Get daily video-level analytics for a date range.

    Returns daily statistics including views, watch time, engagement metrics,
    and impression data. Analytics data starts from video publish date.

    Note: YouTube Analytics API has a 2-3 day lag for data availability.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return [{"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}]

        youtube_analytics = _build_youtube_service(oauth_token, "youtubeAnalytics", "v2")

        try:
            request = youtube_analytics.reports().query(
                ids="channel==MINE",
                startDate=start_date,
                endDate=end_date,
                metrics="views,estimatedMinutesWatched,averageViewDuration,likes,comments,averageViewPercentage,videoThumbnailImpressions,videoThumbnailImpressionsClickRate",
                dimensions="day",
                filters=f"video=={video_id}",
                sort="day",
            )
            response = request.execute()
        except HttpError as e:
            error_str = str(e)
            if "Unknown identifier" in error_str or "not supported" in error_str or "badRequest" in error_str:
                request = youtube_analytics.reports().query(
                    ids="channel==MINE",
                    startDate=start_date,
                    endDate=end_date,
                    metrics="views,estimatedMinutesWatched,averageViewDuration,likes,comments,averageViewPercentage",
                    dimensions="day",
                    filters=f"video=={video_id}",
                    sort="day",
                )
                response = request.execute()
            else:
                raise

        results = []
        column_headers = response.get("columnHeaders", [])
        rows = response.get("rows", [])
        col_map = {header["name"]: idx for idx, header in enumerate(column_headers)}

        for row in rows:
            impressions_val = row[col_map.get("videoThumbnailImpressions", -1)] if "videoThumbnailImpressions" in col_map else None
            ctr_val = row[col_map.get("videoThumbnailImpressionsClickRate", -1)] if "videoThumbnailImpressionsClickRate" in col_map else None

            results.append({
                "date": row[col_map["day"]],
                "views": int(row[col_map.get("views", -1)] or 0),
                "estimatedMinutesWatched": int(row[col_map.get("estimatedMinutesWatched", -1)] or 0),
                "averageViewDuration": int(row[col_map.get("averageViewDuration", -1)] or 0),
                "impressions": int(impressions_val) if impressions_val is not None else None,
                "impressionClickThroughRate": float(ctr_val) if ctr_val is not None else None,
                "likes": int(row[col_map.get("likes", -1)] or 0),
                "comments": int(row[col_map.get("comments", -1)] or 0),
                "averageViewPercentage": float(row[col_map.get("averageViewPercentage", -1)] or 0),
            })

        return results
    except HttpError as e:
        return [_handle_youtube_error(e)]
    except Exception as e:
        return [{"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}]


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def get_content_type_classification(
    context: Context,
    video_ids: Annotated[list[str], "List of YouTube video IDs to classify (up to 50 per request)"],
) -> dict[str, dict]:
    """Classify content type (SHORTS, NORMAL, LIVE) for multiple videos using Data API.

    Uses fileDetails (video dimensions) and duration to achieve 99% accurate classification.
    Note: fileDetails is only accessible to video owners.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return {"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}

        youtube = _build_youtube_service(oauth_token)

        request = youtube.videos().list(
            part="snippet,contentDetails,fileDetails",
            id=",".join(video_ids),
        )
        response = request.execute()

        content_types = {}
        for video in response.get("items", []):
            video_id = video.get("id")
            content_type, width, height, aspect_ratio = _classify_content_type(video)
            content_types[video_id] = {
                "contentType": content_type,
                "width": width,
                "height": height,
                "aspectRatio": aspect_ratio,
                "duration": _parse_duration_to_seconds(
                    video.get("contentDetails", {}).get("duration", "PT0S")
                ),
            }

        for vid in video_ids:
            if vid not in content_types:
                content_types[vid] = {
                    "contentType": "UNKNOWN",
                    "width": None,
                    "height": None,
                    "aspectRatio": None,
                    "duration": None,
                }

        return content_types
    except HttpError as e:
        return {"error": _handle_youtube_error(e)}
    except Exception as e:
        return {"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def get_multiple_video_analytics(
    context: Context,
    video_ids: Annotated[list[str], "List of YouTube video IDs"],
    start_date: Annotated[str, "Start date in YYYY-MM-DD format"],
    end_date: Annotated[str, "End date in YYYY-MM-DD format"],
) -> dict[str, list[dict]]:
    """Get analytics for multiple videos in a single request.

    More efficient for backfill operations. Returns a dictionary mapping
    video IDs to their daily analytics data.

    Note: YouTube Analytics API has a 2-3 day lag for data availability.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return {"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}

        youtube_analytics = _build_youtube_service(oauth_token, "youtubeAnalytics", "v2")

        try:
            request = youtube_analytics.reports().query(
                ids="channel==MINE",
                startDate=start_date,
                endDate=end_date,
                metrics="views,estimatedMinutesWatched,averageViewDuration,likes,comments,averageViewPercentage,videoThumbnailImpressions,videoThumbnailImpressionsClickRate",
                dimensions="video,day",
                filters=f"video=={','.join(video_ids)}",
                sort="day",
            )
            response = request.execute()
        except HttpError as e:
            error_str = str(e)
            if "Unknown identifier" in error_str or "not supported" in error_str or "badRequest" in error_str:
                request = youtube_analytics.reports().query(
                    ids="channel==MINE",
                    startDate=start_date,
                    endDate=end_date,
                    metrics="views,estimatedMinutesWatched,averageViewDuration,likes,comments,averageViewPercentage",
                    dimensions="video,day",
                    filters=f"video=={','.join(video_ids)}",
                    sort="day",
                )
                response = request.execute()
            else:
                raise

        results: dict[str, list[dict]] = {vid: [] for vid in video_ids}
        column_headers = response.get("columnHeaders", [])
        rows = response.get("rows", [])
        col_map = {header["name"]: idx for idx, header in enumerate(column_headers)}

        for row in rows:
            video_id = row[col_map["video"]]
            if video_id in results:
                impressions_val = row[col_map.get("videoThumbnailImpressions", -1)] if "videoThumbnailImpressions" in col_map else None
                ctr_val = row[col_map.get("videoThumbnailImpressionsClickRate", -1)] if "videoThumbnailImpressionsClickRate" in col_map else None

                results[video_id].append({
                    "date": row[col_map["day"]],
                    "views": int(row[col_map.get("views", -1)] or 0),
                    "estimatedMinutesWatched": int(row[col_map.get("estimatedMinutesWatched", -1)] or 0),
                    "averageViewDuration": int(row[col_map.get("averageViewDuration", -1)] or 0),
                    "impressions": int(impressions_val) if impressions_val is not None else None,
                    "impressionClickThroughRate": float(ctr_val) if ctr_val is not None else None,
                    "likes": int(row[col_map.get("likes", -1)] or 0),
                    "comments": int(row[col_map.get("comments", -1)] or 0),
                    "averageViewPercentage": float(row[col_map.get("averageViewPercentage", -1)] or 0),
                })

        return results
    except HttpError as e:
        return {"error": _handle_youtube_error(e)}
    except Exception as e:
        return {"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def get_batch_video_comprehensive_analytics(
    context: Context,
    video_ids: Annotated[list[str], "List of YouTube video IDs (up to 200)"],
    start_date: Annotated[str, "Start date in YYYY-MM-DD format"],
    end_date: Annotated[str, "End date in YYYY-MM-DD format"],
) -> dict[str, list[dict]]:
    """Get comprehensive daily analytics for multiple videos in a single request.

    Returns all available metrics including core engagement, Shorts metrics,
    Premium metrics, playlist metrics, subscriber impact, live stream metrics,
    and card engagement. Optimized for backfill - up to 200 videos per call.

    Note: YouTube Analytics API has a 2-3 day lag for data availability.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return {"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}

        youtube_analytics = _build_youtube_service(oauth_token, "youtubeAnalytics", "v2")

        request = youtube_analytics.reports().query(
            ids="channel==MINE",
            startDate=start_date,
            endDate=end_date,
            metrics="views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,videosAddedToPlaylists,videosRemovedFromPlaylists,subscribersGained,subscribersLost,redViews,estimatedRedMinutesWatched,cardImpressions,cardClicks,cardClickRate,cardTeaserImpressions,cardTeaserClicks,cardTeaserClickRate,averageConcurrentViewers,peakConcurrentViewers",
            dimensions="video,day",
            filters=f"video=={','.join(video_ids)}",
            sort="day",
        )
        response = request.execute()

        results: dict[str, list[dict]] = {vid: [] for vid in video_ids}
        column_headers = response.get("columnHeaders", [])
        rows = response.get("rows", [])
        col_map = {header["name"]: idx for idx, header in enumerate(column_headers)}

        for row in rows:
            video_id = row[col_map["video"]]
            if video_id in results:
                def get_int(col_name: str) -> int | None:
                    if col_name in col_map:
                        val = row[col_map[col_name]]
                        return int(val) if val is not None else None
                    return None

                def get_float(col_name: str) -> float | None:
                    if col_name in col_map:
                        val = row[col_map[col_name]]
                        return float(val) if val is not None else None
                    return None

                results[video_id].append({
                    "date": row[col_map["day"]],
                    "views": int(row[col_map.get("views", -1)] or 0),
                    "estimatedMinutesWatched": int(row[col_map.get("estimatedMinutesWatched", -1)] or 0),
                    "averageViewDuration": int(row[col_map.get("averageViewDuration", -1)] or 0),
                    "averageViewPercentage": float(row[col_map.get("averageViewPercentage", -1)] or 0),
                    "likes": int(row[col_map.get("likes", -1)] or 0),
                    "comments": int(row[col_map.get("comments", -1)] or 0),
                    "shares": get_int("shares"),
                    "videosAddedToPlaylists": get_int("videosAddedToPlaylists"),
                    "videosRemovedFromPlaylists": get_int("videosRemovedFromPlaylists"),
                    "subscribersGained": get_int("subscribersGained"),
                    "subscribersLost": get_int("subscribersLost"),
                    "engagedViews": get_int("engagedViews"),
                    "redViews": get_int("redViews"),
                    "estimatedRedMinutesWatched": get_int("estimatedRedMinutesWatched"),
                    "cardImpressions": get_int("cardImpressions"),
                    "cardClicks": get_int("cardClicks"),
                    "cardClickRate": get_float("cardClickRate"),
                    "cardTeaserImpressions": get_int("cardTeaserImpressions"),
                    "cardTeaserClicks": get_int("cardTeaserClicks"),
                    "cardTeaserClickRate": get_float("cardTeaserClickRate"),
                    "averageConcurrentViewers": get_int("averageConcurrentViewers"),
                    "peakConcurrentViewers": get_int("peakConcurrentViewers"),
                })

        return results
    except HttpError as e:
        return {"error": _handle_youtube_error(e)}
    except Exception as e:
        return {"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def get_batch_video_traffic_sources(
    context: Context,
    video_ids: Annotated[list[str], "List of YouTube video IDs (up to 200)"],
    start_date: Annotated[str, "Start date in YYYY-MM-DD format"],
    end_date: Annotated[str, "End date in YYYY-MM-DD format"],
) -> dict[str, list[dict]]:
    """Get traffic source breakdown for multiple videos with daily granularity.

    Returns views and watch time broken down by traffic source type per video per day.

    Note: YouTube Analytics API has a 2-3 day lag for data availability.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return {"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}

        youtube_analytics = _build_youtube_service(oauth_token, "youtubeAnalytics", "v2")

        request = youtube_analytics.reports().query(
            ids="channel==MINE",
            startDate=start_date,
            endDate=end_date,
            metrics="views,estimatedMinutesWatched",
            dimensions="video,day,insightTrafficSourceType",
            filters=f"video=={','.join(video_ids)}",
            sort="day",
        )
        response = request.execute()

        results: dict[str, list[dict]] = {vid: [] for vid in video_ids}
        column_headers = response.get("columnHeaders", [])
        rows = response.get("rows", [])
        col_map = {header["name"]: idx for idx, header in enumerate(column_headers)}

        for row in rows:
            video_id = row[col_map["video"]]
            if video_id in results:
                results[video_id].append({
                    "date": row[col_map["day"]],
                    "trafficSourceType": row[col_map.get("insightTrafficSourceType", -1)] or "UNKNOWN",
                    "views": int(row[col_map.get("views", -1)] or 0),
                    "estimatedMinutesWatched": int(row[col_map.get("estimatedMinutesWatched", -1)] or 0),
                })

        return results
    except HttpError as e:
        return {"error": _handle_youtube_error(e)}
    except Exception as e:
        return {"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def get_batch_video_device_stats(
    context: Context,
    video_ids: Annotated[list[str], "List of YouTube video IDs (up to 200)"],
    start_date: Annotated[str, "Start date in YYYY-MM-DD format"],
    end_date: Annotated[str, "End date in YYYY-MM-DD format"],
) -> dict[str, list[dict]]:
    """Get device/platform breakdown for multiple videos with daily granularity.

    Returns views and watch time broken down by device type per video per day.

    Note: YouTube Analytics API has a 2-3 day lag for data availability.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return {"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}

        youtube_analytics = _build_youtube_service(oauth_token, "youtubeAnalytics", "v2")

        request = youtube_analytics.reports().query(
            ids="channel==MINE",
            startDate=start_date,
            endDate=end_date,
            metrics="views,estimatedMinutesWatched,averageViewDuration",
            dimensions="video,day,deviceType",
            filters=f"video=={','.join(video_ids)}",
            sort="day",
        )
        response = request.execute()

        results: dict[str, list[dict]] = {vid: [] for vid in video_ids}
        column_headers = response.get("columnHeaders", [])
        rows = response.get("rows", [])
        col_map = {header["name"]: idx for idx, header in enumerate(column_headers)}

        for row in rows:
            video_id = row[col_map["video"]]
            if video_id in results:
                results[video_id].append({
                    "date": row[col_map["day"]],
                    "deviceType": row[col_map.get("deviceType", -1)] or "UNKNOWN",
                    "views": int(row[col_map.get("views", -1)] or 0),
                    "estimatedMinutesWatched": int(row[col_map.get("estimatedMinutesWatched", -1)] or 0),
                    "averageViewDuration": int(row[col_map.get("averageViewDuration", -1)] or 0),
                })

        return results
    except HttpError as e:
        return {"error": _handle_youtube_error(e)}
    except Exception as e:
        return {"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def get_batch_video_geography_stats(
    context: Context,
    video_ids: Annotated[list[str], "List of YouTube video IDs (up to 100, lower due to country dimension size)"],
    start_date: Annotated[str, "Start date in YYYY-MM-DD format"],
    end_date: Annotated[str, "End date in YYYY-MM-DD format"],
    top_countries_only: Annotated[Optional[bool], "If True, only return top 10 markets (US, GB, CA, AU, IN, DE, FR, BR, MX, JP)"] = True,
) -> dict[str, list[dict]]:
    """Get geographic breakdown for multiple videos with daily granularity.

    Returns views and watch time broken down by country per video per day.

    Note: YouTube Analytics API has a 2-3 day lag for data availability.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return {"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}

        youtube_analytics = _build_youtube_service(oauth_token, "youtubeAnalytics", "v2")

        video_filter = f"video=={','.join(video_ids)}"
        if top_countries_only:
            country_filter = "country==US,GB,CA,AU,IN,DE,FR,BR,MX,JP"
            filters = f"{video_filter};{country_filter}"
        else:
            filters = video_filter

        request = youtube_analytics.reports().query(
            ids="channel==MINE",
            startDate=start_date,
            endDate=end_date,
            metrics="views,estimatedMinutesWatched,subscribersGained",
            dimensions="video,day,country",
            filters=filters,
            sort="day",
        )
        response = request.execute()

        results: dict[str, list[dict]] = {vid: [] for vid in video_ids}
        column_headers = response.get("columnHeaders", [])
        rows = response.get("rows", [])
        col_map = {header["name"]: idx for idx, header in enumerate(column_headers)}

        for row in rows:
            video_id = row[col_map["video"]]
            if video_id in results:
                results[video_id].append({
                    "date": row[col_map["day"]],
                    "country": row[col_map.get("country", -1)] or "ZZ",
                    "views": int(row[col_map.get("views", -1)] or 0),
                    "estimatedMinutesWatched": int(row[col_map.get("estimatedMinutesWatched", -1)] or 0),
                    "subscribersGained": int(row[col_map.get("subscribersGained", -1)] or 0),
                })

        return results
    except HttpError as e:
        return {"error": _handle_youtube_error(e)}
    except Exception as e:
        return {"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def get_video_retention_curve(
    context: Context,
    video_id: Annotated[str, "YouTube video ID"],
    start_date: Annotated[str, "Start date in YYYY-MM-DD format (recommend last 90 days)"],
    end_date: Annotated[str, "End date in YYYY-MM-DD format"],
) -> list[dict]:
    """Get audience retention curve for a single video.

    Returns retention data points from 0% to 100% of video duration.
    Cannot be batched — must query one video at a time.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return [{"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}]

        youtube_analytics = _build_youtube_service(oauth_token, "youtubeAnalytics", "v2")

        request = youtube_analytics.reports().query(
            ids="channel==MINE",
            startDate=start_date,
            endDate=end_date,
            metrics="audienceWatchRatio,relativeRetentionPerformance",
            dimensions="elapsedVideoTimeRatio",
            filters=f"video=={video_id}",
        )
        response = request.execute()

        results = []
        column_headers = response.get("columnHeaders", [])
        rows = response.get("rows", [])
        col_map = {header["name"]: idx for idx, header in enumerate(column_headers)}

        for row in rows:
            results.append({
                "elapsedRatio": float(row[col_map.get("elapsedVideoTimeRatio", -1)] or 0),
                "audienceWatchRatio": float(row[col_map.get("audienceWatchRatio", -1)] or 0),
                "relativeRetentionPerformance": float(row[col_map.get("relativeRetentionPerformance", -1)] or 0) if "relativeRetentionPerformance" in col_map else None,
            })

        return results
    except HttpError as e:
        return [_handle_youtube_error(e)]
    except Exception as e:
        return [{"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}]


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def get_live_stream_timeline(
    context: Context,
    video_id: Annotated[str, "YouTube video ID of live stream"],
    stream_date: Annotated[str, "Date of the stream in YYYY-MM-DD format"],
) -> list[dict]:
    """Get minute-by-minute concurrent viewer data for a live stream.

    Cannot be batched — must query one video at a time.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return [{"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}]

        youtube_analytics = _build_youtube_service(oauth_token, "youtubeAnalytics", "v2")

        request = youtube_analytics.reports().query(
            ids="channel==MINE",
            startDate=stream_date,
            endDate=stream_date,
            metrics="averageConcurrentViewers,peakConcurrentViewers",
            dimensions="livestreamPosition",
            filters=f"video=={video_id}",
        )
        response = request.execute()

        results = []
        column_headers = response.get("columnHeaders", [])
        rows = response.get("rows", [])
        col_map = {header["name"]: idx for idx, header in enumerate(column_headers)}

        for row in rows:
            results.append({
                "livestreamPosition": int(row[col_map.get("livestreamPosition", -1)] or 0),
                "averageConcurrentViewers": int(row[col_map.get("averageConcurrentViewers", -1)] or 0),
                "peakConcurrentViewers": int(row[col_map.get("peakConcurrentViewers", -1)] or 0),
            })

        return results
    except HttpError as e:
        return [_handle_youtube_error(e)]
    except Exception as e:
        return [{"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}]


# =============================================================================
# Backfill Tools (owned channels — chunked + retries)
# =============================================================================


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def discover_all_videos(
    context: Context,
    channel_id: Annotated[str, "YouTube channel ID"],
) -> dict:
    """Discover ALL videos from an owned channel with automatic pagination.

    Returns every video with metadata, content type classification (SHORTS/NORMAL/LIVE),
    current statistics, and video dimensions. Use as Step 1 of a backfill.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return {"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}

        youtube = _build_youtube_service(oauth_token)

        channel_response = _execute_with_retry(
            youtube.channels().list(part="contentDetails,statistics", id=channel_id)
        )

        if not channel_response.get("items"):
            return {"error": True, "code": "NOT_FOUND", "message": f"Channel {channel_id} not found"}

        channel_item = channel_response["items"][0]
        uploads_playlist_id = channel_item["contentDetails"]["relatedPlaylists"]["uploads"]
        total_videos_reported = int(channel_item.get("statistics", {}).get("videoCount", 0))

        all_video_ids = []
        page_token = None

        while True:
            playlist_response = _execute_with_retry(
                youtube.playlistItems().list(
                    part="contentDetails",
                    playlistId=uploads_playlist_id,
                    maxResults=50,
                    pageToken=page_token,
                )
            )
            page_video_ids = [
                item["contentDetails"]["videoId"] for item in playlist_response.get("items", [])
            ]
            all_video_ids.extend(page_video_ids)

            page_token = playlist_response.get("nextPageToken")
            if not page_token:
                break

        all_videos = []
        for i in range(0, len(all_video_ids), 50):
            batch = all_video_ids[i : i + 50]
            videos_response = _execute_with_retry(
                youtube.videos().list(
                    part="snippet,contentDetails,statistics,fileDetails",
                    id=",".join(batch),
                )
            )

            for video in videos_response.get("items", []):
                snippet = video.get("snippet", {})
                content_details = video.get("contentDetails", {})
                statistics = video.get("statistics", {})
                content_type, width, height, aspect_ratio = _classify_content_type(video)

                all_videos.append({
                    "videoId": video.get("id"),
                    "title": snippet.get("title"),
                    "description": snippet.get("description"),
                    "publishedAt": snippet.get("publishedAt"),
                    "thumbnailUrl": snippet.get("thumbnails", {}).get("high", {}).get("url"),
                    "duration": _parse_duration_to_seconds(content_details.get("duration", "PT0S")),
                    "tags": snippet.get("tags", []),
                    "categoryId": snippet.get("categoryId"),
                    "liveBroadcastContent": snippet.get("liveBroadcastContent", "none"),
                    "contentType": content_type,
                    "width": width,
                    "height": height,
                    "aspectRatio": aspect_ratio,
                    "currentViews": int(statistics.get("viewCount", 0)),
                    "currentLikes": int(statistics.get("likeCount", 0)),
                    "currentComments": int(statistics.get("commentCount", 0)),
                })

        shorts_count = sum(1 for v in all_videos if v["contentType"] == "SHORTS")
        normal_count = sum(1 for v in all_videos if v["contentType"] == "NORMAL")
        live_count = sum(1 for v in all_videos if v["contentType"] == "LIVE")

        return {
            "channelId": channel_id,
            "totalVideosReported": total_videos_reported,
            "totalVideosDiscovered": len(all_videos),
            "contentTypeCounts": {"SHORTS": shorts_count, "NORMAL": normal_count, "LIVE": live_count},
            "videos": all_videos,
        }
    except HttpError as e:
        return _handle_youtube_error(e)
    except Exception as e:
        return {"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def backfill_video_analytics(
    context: Context,
    video_ids: Annotated[list[str], "List of YouTube video IDs"],
    start_date: Annotated[str, "Start date in YYYY-MM-DD format"],
    end_date: Annotated[str, "End date in YYYY-MM-DD format"],
    chunk_days: Annotated[Optional[int], "Days per date chunk (default 180)"] = 180,
) -> dict:
    """Collect daily video analytics with date chunking and retries.

    Splits into two queries per chunk (core + subscriber) for reliability.
    Videos are batched at 200 per query. Works for full backfills and additive updates.

    Note: YouTube Analytics API has a 2-3 day data lag.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return {"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}

        youtube_analytics = _build_youtube_service(oauth_token, "youtubeAnalytics", "v2")

        date_chunks = _split_date_range(start_date, end_date, chunk_days)
        video_batches = [video_ids[i : i + 200] for i in range(0, len(video_ids), 200)]

        daily_stats: dict[str, dict[str, dict]] = {}
        errors = []

        for chunk_start, chunk_end in date_chunks:
            for batch in video_batches:
                video_filter = f"video=={','.join(batch)}"

                try:
                    response = _execute_with_retry(
                        youtube_analytics.reports().query(
                            ids="channel==MINE",
                            startDate=chunk_start,
                            endDate=chunk_end,
                            metrics="views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,videosAddedToPlaylists,videosRemovedFromPlaylists",
                            dimensions="video,day",
                            filters=video_filter,
                            sort="day",
                        )
                    )

                    col_map = {h["name"]: i for i, h in enumerate(response.get("columnHeaders", []))}

                    for row in response.get("rows", []):
                        vid = row[col_map["video"]]
                        date = row[col_map["day"]]

                        if vid not in daily_stats:
                            daily_stats[vid] = {}
                        if date not in daily_stats[vid]:
                            daily_stats[vid][date] = {"date": date}

                        def _safe_int(col_name: str) -> int:
                            if col_name in col_map:
                                val = row[col_map[col_name]]
                                return int(val) if val is not None else 0
                            return 0

                        def _safe_float(col_name: str) -> float:
                            if col_name in col_map:
                                val = row[col_map[col_name]]
                                return float(val) if val is not None else 0.0
                            return 0.0

                        daily_stats[vid][date].update({
                            "views": _safe_int("views"),
                            "estimatedMinutesWatched": _safe_int("estimatedMinutesWatched"),
                            "averageViewDuration": _safe_int("averageViewDuration"),
                            "averageViewPercentage": _safe_float("averageViewPercentage"),
                            "likes": _safe_int("likes"),
                            "comments": _safe_int("comments"),
                            "shares": _safe_int("shares"),
                            "videosAddedToPlaylists": _safe_int("videosAddedToPlaylists"),
                            "videosRemovedFromPlaylists": _safe_int("videosRemovedFromPlaylists"),
                        })
                except HttpError as e:
                    errors.append(f"Core {chunk_start}\u2013{chunk_end}: {str(e)[:100]}")

                try:
                    response = _execute_with_retry(
                        youtube_analytics.reports().query(
                            ids="channel==MINE",
                            startDate=chunk_start,
                            endDate=chunk_end,
                            metrics="subscribersGained,subscribersLost",
                            dimensions="video,day",
                            filters=video_filter,
                            sort="day",
                        )
                    )

                    col_map = {h["name"]: i for i, h in enumerate(response.get("columnHeaders", []))}

                    for row in response.get("rows", []):
                        vid = row[col_map["video"]]
                        date = row[col_map["day"]]

                        if vid not in daily_stats:
                            daily_stats[vid] = {}
                        if date not in daily_stats[vid]:
                            daily_stats[vid][date] = {"date": date}

                        daily_stats[vid][date].update({
                            "subscribersGained": int(row[col_map.get("subscribersGained", -1)] or 0),
                            "subscribersLost": int(row[col_map.get("subscribersLost", -1)] or 0),
                        })
                except HttpError as e:
                    errors.append(f"Subs {chunk_start}\u2013{chunk_end}: {str(e)[:100]}")

        results = {}
        for vid in daily_stats:
            results[vid] = sorted(daily_stats[vid].values(), key=lambda x: x["date"])

        return {
            "data": results,
            "metadata": {
                "videosRequested": len(video_ids),
                "videosWithData": len(results),
                "dateRange": {"start": start_date, "end": end_date},
                "dateChunks": len(date_chunks),
                "videoBatches": len(video_batches),
                "errors": errors if errors else None,
            },
        }
    except HttpError as e:
        return {"error": _handle_youtube_error(e)}
    except Exception as e:
        return {"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def backfill_video_traffic_sources(
    context: Context,
    video_ids: Annotated[list[str], "List of YouTube video IDs"],
    start_date: Annotated[str, "Start date in YYYY-MM-DD format"],
    end_date: Annotated[str, "End date in YYYY-MM-DD format"],
    chunk_days: Annotated[Optional[int], "Days per date chunk (default 180)"] = 180,
) -> dict:
    """Collect daily traffic source breakdown with date chunking and retries.

    Works for both full backfills and additive updates.

    Note: YouTube Analytics API has a 2-3 day data lag.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return {"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}

        youtube_analytics = _build_youtube_service(oauth_token, "youtubeAnalytics", "v2")

        date_chunks = _split_date_range(start_date, end_date, chunk_days)
        video_batches = [video_ids[i : i + 200] for i in range(0, len(video_ids), 200)]

        results: dict[str, list[dict]] = {}
        errors = []

        for chunk_start, chunk_end in date_chunks:
            for batch in video_batches:
                try:
                    response = _execute_with_retry(
                        youtube_analytics.reports().query(
                            ids="channel==MINE",
                            startDate=chunk_start,
                            endDate=chunk_end,
                            metrics="views,estimatedMinutesWatched",
                            dimensions="video,day,insightTrafficSourceType",
                            filters=f"video=={','.join(batch)}",
                            sort="day",
                        )
                    )

                    col_map = {h["name"]: i for i, h in enumerate(response.get("columnHeaders", []))}

                    for row in response.get("rows", []):
                        vid = row[col_map["video"]]
                        if vid not in results:
                            results[vid] = []
                        results[vid].append({
                            "date": row[col_map["day"]],
                            "trafficSourceType": row[col_map.get("insightTrafficSourceType", -1)] or "UNKNOWN",
                            "views": int(row[col_map.get("views", -1)] or 0),
                            "estimatedMinutesWatched": int(row[col_map.get("estimatedMinutesWatched", -1)] or 0),
                        })
                except HttpError as e:
                    errors.append(f"Traffic {chunk_start}\u2013{chunk_end}: {str(e)[:100]}")

        return {
            "data": results,
            "metadata": {
                "videosRequested": len(video_ids),
                "videosWithData": len(results),
                "dateRange": {"start": start_date, "end": end_date},
                "dateChunks": len(date_chunks),
                "videoBatches": len(video_batches),
                "errors": errors if errors else None,
            },
        }
    except HttpError as e:
        return {"error": _handle_youtube_error(e)}
    except Exception as e:
        return {"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}


@app.tool(requires_auth=Google(scopes=YOUTUBE_SCOPES))
async def backfill_video_device_stats(
    context: Context,
    video_ids: Annotated[list[str], "List of YouTube video IDs"],
    start_date: Annotated[str, "Start date in YYYY-MM-DD format"],
    end_date: Annotated[str, "End date in YYYY-MM-DD format"],
    chunk_days: Annotated[Optional[int], "Days per date chunk (default 180)"] = 180,
) -> dict:
    """Collect daily device/platform breakdown with date chunking and retries.

    Works for both full backfills and additive updates.

    Note: YouTube Analytics API has a 2-3 day data lag.
    """
    try:
        oauth_token = context.get_auth_token_or_empty()
        if not oauth_token:
            return {"error": True, "code": "AUTH_INVALID", "message": "No OAuth token available"}

        youtube_analytics = _build_youtube_service(oauth_token, "youtubeAnalytics", "v2")

        date_chunks = _split_date_range(start_date, end_date, chunk_days)
        video_batches = [video_ids[i : i + 200] for i in range(0, len(video_ids), 200)]

        results: dict[str, list[dict]] = {}
        errors = []

        for chunk_start, chunk_end in date_chunks:
            for batch in video_batches:
                try:
                    response = _execute_with_retry(
                        youtube_analytics.reports().query(
                            ids="channel==MINE",
                            startDate=chunk_start,
                            endDate=chunk_end,
                            metrics="views,estimatedMinutesWatched,averageViewDuration",
                            dimensions="video,day,deviceType",
                            filters=f"video=={','.join(batch)}",
                            sort="day",
                        )
                    )

                    col_map = {h["name"]: i for i, h in enumerate(response.get("columnHeaders", []))}

                    for row in response.get("rows", []):
                        vid = row[col_map["video"]]
                        if vid not in results:
                            results[vid] = []
                        results[vid].append({
                            "date": row[col_map["day"]],
                            "deviceType": row[col_map.get("deviceType", -1)] or "UNKNOWN",
                            "views": int(row[col_map.get("views", -1)] or 0),
                            "estimatedMinutesWatched": int(row[col_map.get("estimatedMinutesWatched", -1)] or 0),
                            "averageViewDuration": int(row[col_map.get("averageViewDuration", -1)] or 0),
                        })
                except HttpError as e:
                    errors.append(f"Device {chunk_start}\u2013{chunk_end}: {str(e)[:100]}")

        return {
            "data": results,
            "metadata": {
                "videosRequested": len(video_ids),
                "videosWithData": len(results),
                "dateRange": {"start": start_date, "end": end_date},
                "dateChunks": len(date_chunks),
                "videoBatches": len(video_batches),
                "errors": errors if errors else None,
            },
        }
    except HttpError as e:
        return {"error": _handle_youtube_error(e)}
    except Exception as e:
        return {"error": True, "code": "UNKNOWN_ERROR", "message": str(e)}


# =============================================================================
# PUBLIC / TRACKED CHANNEL TOOLS (API key)
# =============================================================================


@app.tool(requires_secrets=["YOUTUBE_API_KEY"])
def list_public_channel_videos(
    context: Context,
    channel_id_or_handle: Annotated[str, "The channel's ID (e.g. UC...) or handle (with or without @)"],
    num_videos: Annotated[int, "Number of videos to return. 10 by default."] = 10,
    date: Annotated[str | None, "ISO formatted date (e.g. 2025-01-15). Only videos uploaded on or after this date are returned, optional."] = None,
    next_page_token: Annotated[str | None, "Token to fetch the next page of results"] = None,
) -> dict:
    """List videos uploaded by any public YouTube channel.

    Returns a dict with "videos" (list of video objects including stats) and
    "next_page_token" (str) if more results are available.
    """
    api_key = context.get_secret("YOUTUBE_API_KEY")
    youtube = _build_youtube_service_with_key(api_key)

    channel = _resolve_channel(youtube, channel_id_or_handle)
    uploads_playlist_id = channel["contentDetails"]["relatedPlaylists"]["uploads"]

    return _fetch_videos_with_stats(
        youtube, uploads_playlist_id, num_videos, date=date, page_token=next_page_token
    )


@app.tool(requires_secrets=["YOUTUBE_API_KEY"])
def score_channel(
    context: Context,
    channel_id_or_handle: Annotated[str, "The channel's ID (e.g. UC...) or handle (with or without @)"],
    num_videos: Annotated[int, "Number of videos to score. 10 by default."] = 10,
    date: Annotated[str | None, "ISO formatted date (e.g. 2025-01-15). Only videos uploaded on or after this date are scored, optional."] = None,
) -> dict:
    """Return the engagement score of any public YouTube channel.

    The engagement score is the average engagement rate across recent videos:
    (0.8 * views + 0.2 * 0.5 * (likes/views + comments/views)) / subscriber_count
    """
    api_key = context.get_secret("YOUTUBE_API_KEY")
    youtube = _build_youtube_service_with_key(api_key)

    channel = _resolve_channel(youtube, channel_id_or_handle, parts="contentDetails,statistics")
    subscriber_count = int(channel["statistics"]["subscriberCount"])
    if subscriber_count == 0:
        raise ValueError("Channel has 0 subscribers, cannot compute engagement score")

    uploads_playlist_id = channel["contentDetails"]["relatedPlaylists"]["uploads"]

    result = _fetch_videos_with_stats(youtube, uploads_playlist_id, num_videos, date=date)
    videos = result["videos"]

    if not videos:
        raise ValueError("No videos found matching the criteria")

    engagement_rates: list[float] = []
    for v in videos:
        if v["views"] == 0:
            continue
        rate = (
            0.8 * v["views"] + 0.2 * 0.5 * (v["likes"] / v["views"] + v["comments"] / v["views"])
        ) / subscriber_count
        engagement_rates.append(rate)

    if not engagement_rates:
        raise ValueError("No videos with views found to compute engagement score")

    avg_score = sum(engagement_rates) / len(engagement_rates)
    num_analyzed = len(engagement_rates)

    total_views = sum(v["views"] for v in videos if v["views"] > 0)
    total_likes = sum(v["likes"] for v in videos if v["views"] > 0)
    total_comments = sum(v["comments"] for v in videos if v["views"] > 0)

    return {
        "channel": channel_id_or_handle,
        "subscriber_count": subscriber_count,
        "videos_analyzed": num_analyzed,
        "engagement_score": round(avg_score, 6),
        "average_views": round(total_views / num_analyzed, 2),
        "average_likes": round(total_likes / num_analyzed, 2),
        "average_comments": round(total_comments / num_analyzed, 2),
    }


# Run with specific transport
if __name__ == "__main__":
    transport = sys.argv[1] if len(sys.argv) > 1 else "stdio"
    app.run(transport=transport, host="127.0.0.1", port=8000)
