"""Interactive Session MCP Server.

Provides tools for remotely controlling the YouTube analytics platform:
- Notification CRUD
- Scheduler CRUD
- Channel analytics reporting
- Video summarization
- Transcript search
"""

from typing import Annotated, Optional

from arcade.sdk import ToolContext, tool
from arcade.sdk.auth import OAuth2

from .elysia_client import ElysiaClient

# The provider_id must match the OAuth2 provider configured in the user's Arcade account
YT_ADMIN_AUTH = OAuth2(
    provider_id="yt-admin",
    scopes=["openid"],
)


def _get_client(context: ToolContext) -> ElysiaClient:
    """Create an authenticated Elysia client using the OAuth2 access token."""
    base_url = context.get_secret("ELYSIA_BASE_URL")
    token = context.authorization.token
    return ElysiaClient(base_url=base_url, token=token)


# ── Notification Tools ────────────────────────────────────────────────────────


@tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def list_notifications(
    context: ToolContext,
    page_token: Annotated[Optional[str], "Token for next page of results"] = None,
) -> dict:
    """List configured notifications for the current user.

    Returns a paginated list of notification configurations.
    Use next_page_token from the response to fetch more results.
    """
    client = _get_client(context)
    params = {}
    if page_token:
        params["page_token"] = page_token
    result = await client.get("/api/v1/interactive/notifications", params=params)
    await client.close()
    return result


@tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def create_notification(
    context: ToolContext,
    name: Annotated[str, "Name for this notification rule"],
    notification_type: Annotated[
        str,
        "Type: new_video, milestone_views, engagement_drop, engagement_spike, subscriber_change, custom",
    ],
    delivery_method: Annotated[str, "Delivery method: email, webhook, slack, in_app"],
    channel_id: Annotated[Optional[str], "Channel ID to monitor (optional)"] = None,
) -> dict:
    """Create a new notification configuration."""
    client = _get_client(context)
    body = {
        "name": name,
        "notification_type": notification_type,
        "delivery_method": delivery_method,
    }
    if channel_id:
        body["channel_id"] = channel_id
    result = await client.post("/api/v1/interactive/notifications", json=body)
    await client.close()
    return result


@tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def delete_notification(
    context: ToolContext,
    notification_id: Annotated[str, "ID of the notification to delete"],
) -> dict:
    """Delete a notification configuration."""
    client = _get_client(context)
    result = await client.delete(f"/api/v1/interactive/notifications/{notification_id}")
    await client.close()
    return result


# ── Scheduler Tools ───────────────────────────────────────────────────────────


@tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def list_schedules(
    context: ToolContext,
    page_token: Annotated[Optional[str], "Token for next page of results"] = None,
) -> dict:
    """List configured scan schedules for the current user.

    Returns a paginated list of scan schedule configurations.
    """
    client = _get_client(context)
    params = {}
    if page_token:
        params["page_token"] = page_token
    result = await client.get("/api/v1/interactive/schedules", params=params)
    await client.close()
    return result


@tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def create_schedule(
    context: ToolContext,
    scan_type: Annotated[
        str,
        "Type: owned_backfill, owned_daily_sync, tracked_daily_poll, track_new_channel, transcription",
    ],
    cron_expression: Annotated[str, "Cron expression for scheduling (e.g. '0 3 * * *' for daily at 3 AM)"],
    channel_id: Annotated[Optional[str], "Channel ID for channel-specific scans (optional)"] = None,
) -> dict:
    """Create a new scan schedule."""
    client = _get_client(context)
    body = {
        "scan_type": scan_type,
        "cron_expression": cron_expression,
    }
    if channel_id:
        body["channel_id"] = channel_id
    result = await client.post("/api/v1/interactive/schedules", json=body)
    await client.close()
    return result


@tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def delete_schedule(
    context: ToolContext,
    schedule_id: Annotated[str, "ID of the schedule to delete"],
) -> dict:
    """Delete a scan schedule."""
    client = _get_client(context)
    result = await client.delete(f"/api/v1/interactive/schedules/{schedule_id}")
    await client.close()
    return result


# ── Reporting Tools ───────────────────────────────────────────────────────────


@tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def get_channel_analytics(
    context: ToolContext,
    channel_id: Annotated[str, "YouTube channel ID"],
    start_date: Annotated[Optional[str], "Start date in YYYY-MM-DD format"] = None,
    end_date: Annotated[Optional[str], "End date in YYYY-MM-DD format"] = None,
    page_token: Annotated[Optional[str], "Pagination token"] = None,
) -> dict:
    """Get channel analytics from the system's database.

    Returns daily channel-level metrics for the specified date range.
    This retrieves data already stored in the system, not from the YouTube API directly.
    """
    client = _get_client(context)
    params = {}
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date
    if page_token:
        params["page_token"] = page_token
    result = await client.get(
        f"/api/v1/interactive/channels/{channel_id}/analytics", params=params
    )
    await client.close()
    return result


@tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def summarize_video(
    context: ToolContext,
    video_id: Annotated[str, "YouTube video ID"],
) -> dict:
    """Get a summary of a video using its available transcript.

    Returns the video title and a summary generated from the transcription.
    """
    client = _get_client(context)
    result = await client.get(f"/api/v1/interactive/videos/{video_id}/summary")
    await client.close()
    return result


@tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def search_in_channel(
    context: ToolContext,
    channel_id: Annotated[str, "YouTube channel ID to search within"],
    query: Annotated[str, "Search query for transcript content"],
    page_token: Annotated[Optional[str], "Pagination token"] = None,
) -> dict:
    """Search video transcripts within a channel.

    Uses the indexed transcripts to find relevant content matching the query.
    Results include URLs to the transcription files.
    """
    client = _get_client(context)
    params = {"q": query}
    if page_token:
        params["page_token"] = page_token
    result = await client.get(
        f"/api/v1/interactive/channels/{channel_id}/search", params=params
    )
    await client.close()
    return result
