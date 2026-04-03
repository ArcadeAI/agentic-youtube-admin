"""Interactive Session MCP Server.

Provides tools for remotely controlling the YouTube analytics platform:
- Notification CRUD
- Scheduler CRUD
- Channel analytics reporting
- Video summarization
- Transcript search
"""

import logging
import sys
from typing import Annotated, Optional

import httpx
from arcade_mcp_server import Context, MCPApp
from arcade_mcp_server.auth import OAuth2

logger = logging.getLogger(__name__)

app = MCPApp(name="arcade_interactive_session", version="1.2.0", log_level="DEBUG")

# The provider_id must match the OAuth2 provider configured in the user's Arcade account
YT_ADMIN_AUTH = OAuth2(
    id="yt-admin",
    scopes=["openid"],
)


def _get_client(context: Context) -> httpx.AsyncClient:
    """Create an authenticated HTTP client using the OAuth2 access token."""
    base_url = context.get_secret("ELYSIA_BASE_URL")
    token = context.get_auth_token_or_empty()
    logger.info("[http] base_url=%s token_len=%d", base_url, len(token) if token else 0)
    return httpx.AsyncClient(
        base_url=base_url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        timeout=30.0,
    )


async def _parse_response(resp: httpx.Response) -> dict:
    """Raise on HTTP errors, then parse JSON — with diagnostics on failure."""
    logger.info(
        "[http] %s %s → status=%d content_length=%s content_type=%s",
        resp.request.method,
        resp.url,
        resp.status_code,
        resp.headers.get("content-length", "missing"),
        resp.headers.get("content-type", "missing"),
    )
    resp.raise_for_status()
    raw = resp.content
    logger.info("[http] raw body (%d bytes): %s", len(raw), raw[:500])
    if not raw:
        raise ValueError(
            f"Empty response body from {resp.request.method} {resp.url} "
            f"(status {resp.status_code}, headers: {dict(resp.headers)})"
        )
    return resp.json()


async def _get(context: Context, path: str, params: dict | None = None) -> dict:
    async with _get_client(context) as client:
        resp = await client.get(path, params=params)
        return await _parse_response(resp)


async def _post(context: Context, path: str, json: dict | None = None) -> dict:
    async with _get_client(context) as client:
        resp = await client.post(path, json=json)
        return await _parse_response(resp)


async def _delete(context: Context, path: str) -> dict:
    async with _get_client(context) as client:
        resp = await client.delete(path)
        return await _parse_response(resp)


# ── Notification Tools ────────────────────────────────────────────────────────


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def list_notifications(
    context: Context,
    page_token: Annotated[Optional[str], "Token for next page of results"] = None,
) -> dict:
    """List configured notifications for the current user.

    Returns a paginated list of notification configurations.
    Use next_page_token from the response to fetch more results.
    """
    params = {}
    if page_token:
        params["page_token"] = page_token
    return await _get(context, "/api/v1/interactive/notifications", params=params)


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def create_notification(
    context: Context,
    name: Annotated[str, "Name for this notification rule"],
    notification_type: Annotated[
        str,
        "Type: new_video, milestone_views, engagement_drop, engagement_spike, subscriber_change, custom",
    ],
    delivery_method: Annotated[str, "Delivery method: email, webhook, slack, in_app"],
    channel_id: Annotated[Optional[str], "Channel ID to monitor (optional)"] = None,
) -> dict:
    """Create a new notification configuration."""
    body = {
        "name": name,
        "notification_type": notification_type,
        "delivery_method": delivery_method,
    }
    if channel_id:
        body["channel_id"] = channel_id
    return await _post(context, "/api/v1/interactive/notifications", json=body)


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def delete_notification(
    context: Context,
    notification_id: Annotated[str, "ID of the notification to delete"],
) -> dict:
    """Delete a notification configuration."""
    return await _delete(context, f"/api/v1/interactive/notifications/{notification_id}")


# ── Scheduler Tools ───────────────────────────────────────────────────────────


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def list_schedules(
    context: Context,
    page_token: Annotated[Optional[str], "Token for next page of results"] = None,
) -> dict:
    """List configured scan schedules for the current user.

    Returns a paginated list of scan schedule configurations.
    """
    params = {}
    if page_token:
        params["page_token"] = page_token
    return await _get(context, "/api/v1/interactive/schedules", params=params)


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def create_schedule(
    context: Context,
    scan_type: Annotated[
        str,
        "Type: owned_backfill, owned_daily_sync, tracked_daily_poll, track_new_channel, transcription",
    ],
    cron_expression: Annotated[str, "Cron expression for scheduling (e.g. '0 3 * * *' for daily at 3 AM)"],
    channel_id: Annotated[Optional[str], "Channel ID for channel-specific scans (optional)"] = None,
) -> dict:
    """Create a new scan schedule."""
    body = {
        "scan_type": scan_type,
        "cron_expression": cron_expression,
    }
    if channel_id:
        body["channel_id"] = channel_id
    return await _post(context, "/api/v1/interactive/schedules", json=body)


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def delete_schedule(
    context: Context,
    schedule_id: Annotated[str, "ID of the schedule to delete"],
) -> dict:
    """Delete a scan schedule."""
    return await _delete(context, f"/api/v1/interactive/schedules/{schedule_id}")


# ── Reporting Tools ───────────────────────────────────────────────────────────


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def get_channel_analytics(
    context: Context,
    channel_id: Annotated[str, "YouTube channel ID"],
    start_date: Annotated[Optional[str], "Start date in YYYY-MM-DD format"] = None,
    end_date: Annotated[Optional[str], "End date in YYYY-MM-DD format"] = None,
    page_token: Annotated[Optional[str], "Pagination token"] = None,
) -> dict:
    """Get channel analytics from the system's database.

    Returns daily channel-level metrics for the specified date range.
    This retrieves data already stored in the system, not from the YouTube API directly.
    """
    params = {}
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date
    if page_token:
        params["page_token"] = page_token
    return await _get(
        context, f"/api/v1/interactive/channels/{channel_id}/analytics", params=params
    )


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def summarize_video(
    context: Context,
    video_id: Annotated[str, "YouTube video ID"],
) -> dict:
    """Get a summary of a video using its available transcript.

    Returns the video title and a summary generated from the transcription.
    """
    return await _get(context, f"/api/v1/interactive/videos/{video_id}/summary")


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def search_in_channel(
    context: Context,
    channel_id: Annotated[str, "YouTube channel ID to search within"],
    query: Annotated[str, "Search query for transcript content"],
    page_token: Annotated[Optional[str], "Pagination token"] = None,
) -> dict:
    """Search video transcripts within a channel.

    Uses the indexed transcripts to find relevant content matching the query.
    Results include URLs to the transcription files.
    """
    params: dict[str, str] = {"q": query}
    if page_token:
        params["page_token"] = page_token
    return await _get(
        context, f"/api/v1/interactive/channels/{channel_id}/search", params=params
    )


if __name__ == "__main__":
    transport = sys.argv[1] if len(sys.argv) > 1 else "stdio"
    app.run(transport=transport, host="127.0.0.1", port=8000)
