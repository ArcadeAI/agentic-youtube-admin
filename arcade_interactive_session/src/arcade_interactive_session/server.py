"""Interactive Session MCP Server.

Provides tools for remotely controlling the YouTube analytics platform:
- System overview (owned channels, tracked channels, schedules, notifications)
- Notification CRUD
- Scheduler CRUD
- Channel analytics reporting
- Video summarization
- Transcript search
"""

import sys
from typing import Annotated, Optional

import httpx
from arcade_mcp_server import Context, MCPApp
from arcade_mcp_server.auth import OAuth2

app = MCPApp(name="arcade_interactive_session", version="1.5.0", log_level="DEBUG")

# The provider_id must match the OAuth2 provider configured in the user's Arcade account
YT_ADMIN_AUTH = OAuth2(
    id="yt-admin",
    scopes=["openid"],
)


def _get_client(context: Context) -> tuple[httpx.AsyncClient, str]:
    """Create an authenticated HTTP client. Returns (client, base_url) for logging."""
    base_url = context.get_secret("ELYSIA_BASE_URL")
    token = context.get_auth_token_or_empty()

    if not token:
        raise ValueError(
            f"No auth token available in context. "
            f"authorization={context.authorization!r}, user_id={context.user_id!r}"
        )

    return httpx.AsyncClient(
        base_url=base_url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        timeout=30.0,
    ), base_url


async def _request(
    context: Context,
    method: str,
    path: str,
    params: dict | None = None,
    json: dict | None = None,
) -> dict:
    """Make an authenticated request and return parsed JSON."""
    client, base_url = _get_client(context)
    async with client:
        resp = await client.request(method, path, params=params, json=json)

        # Always try to surface the response body in errors
        body = resp.text
        if resp.status_code >= 400:
            raise ValueError(
                f"{method} {base_url}{path} returned {resp.status_code}: {body[:500]}"
            )
        try:
            return resp.json()
        except Exception as exc:
            raise ValueError(
                f"{method} {base_url}{path} returned {resp.status_code} but body is not JSON "
                f"(content-type={resp.headers.get('content-type', 'missing')}): {body[:500]}"
            ) from exc


# ── Overview & Config Tools ──────────────────────────────────────────────────


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def get_overview(context: Context) -> dict:
    """Get a high-level overview of everything the user has set up.

    Returns owned YouTube channels, externally tracked channels,
    and counts of schedules and notifications. All channel references
    use YouTube channel IDs and handles, never internal database IDs.
    """
    return await _request(context, "GET", "/api/v1/interactive/overview")


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def get_owned_config(context: Context) -> dict:
    """Get detailed configuration for the user's owned YouTube channels.

    Returns each owned channel with its YouTube channel ID, handle, sync status,
    backfill progress, and associated scan schedules and notification configs.
    """
    return await _request(context, "GET", "/api/v1/interactive/owned")


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def get_external_tracking(context: Context) -> dict:
    """Get all externally tracked (competitor) channels and their configuration.

    Returns each tracked channel with its YouTube channel ID, handle,
    tracking status, last poll time, notes, and associated scan schedules.
    """
    return await _request(context, "GET", "/api/v1/interactive/tracking")


# ── Remote Control Tools ──────────────────────────────────────────────────────


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def track_channel(
    context: Context,
    channel_id_or_handle: Annotated[str, "YouTube channel ID (UC...) or @handle of the channel to start tracking"],
    notes: Annotated[Optional[str], "Free-text note explaining why this channel is being tracked (stored internally)"] = None,
) -> dict:
    """Add an external YouTube channel to the tracking system.

    Creates or reactivates a tracked channel record. Channel metadata (title,
    thumbnail, handle) will be populated automatically on the next poll.
    """
    body: dict[str, str] = {"channel_id": channel_id_or_handle}
    if notes:
        body["notes"] = notes
    return await _request(context, "POST", "/api/v1/interactive/tracking/track", json=body)


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def start_backfill(
    context: Context,
    channel_id_or_handle: Annotated[str, "YouTube channel ID (UC...) or @handle of an owned channel to backfill"],
    start_date: Annotated[Optional[str], "Backfill start date in YYYY-MM-DD format (default: 2 years ago)"] = None,
    end_date: Annotated[Optional[str], "Backfill end date in YYYY-MM-DD format (default: yesterday)"] = None,
) -> dict:
    """Start a historical data backfill for an owned YouTube channel.

    This is a long-running process (minutes to hours depending on channel size).
    Returns a process ID immediately. Use get_process_status to check progress,
    cancel_process to abort, or list_active_processes to see all running processes.

    The backfill discovers all videos, then collects analytics, traffic sources,
    device stats, retention curves, and live stream timelines.
    """
    body: dict[str, str] = {"channel_id": channel_id_or_handle}
    if start_date:
        body["start_date"] = start_date
    if end_date:
        body["end_date"] = end_date
    return await _request(context, "POST", "/api/v1/interactive/processes/backfill", json=body)


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def get_process_status(
    context: Context,
    process_id: Annotated[str, "The process ID returned by start_backfill"],
) -> dict:
    """Check the status of a running or completed process.

    Returns the process status (running, success, error, canceled),
    start/completion times, and the result or error message.
    """
    return await _request(context, "GET", f"/api/v1/interactive/processes/{process_id}")


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def cancel_process(
    context: Context,
    process_id: Annotated[str, "The process ID of the running process to cancel"],
) -> dict:
    """Cancel a running process.

    Attempts to stop the workflow and marks it as canceled.
    Has no effect on already-completed processes.
    """
    return await _request(context, "POST", f"/api/v1/interactive/processes/{process_id}/cancel")


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def list_active_processes(context: Context) -> dict:
    """List all currently running processes for the authenticated user.

    Returns a list of active process records with their IDs, types, and start times.
    Use get_process_status for detailed information about a specific process.
    """
    return await _request(context, "GET", "/api/v1/interactive/processes")


# ── Notification Tools ───────────────────────────────────────────────────────


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
    return await _request(context, "GET", "/api/v1/interactive/notifications", params=params)


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
    channel_id: Annotated[Optional[str], "YouTube channel ID or @handle (optional)"] = None,
) -> dict:
    """Create a new notification configuration."""
    body: dict[str, str] = {
        "name": name,
        "notification_type": notification_type,
        "delivery_method": delivery_method,
    }
    if channel_id:
        body["channel_id"] = channel_id
    return await _request(context, "POST", "/api/v1/interactive/notifications", json=body)


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def delete_notification(
    context: Context,
    notification_id: Annotated[str, "ID of the notification to delete"],
) -> dict:
    """Delete a notification configuration."""
    return await _request(context, "DELETE", f"/api/v1/interactive/notifications/{notification_id}")


# ── Scheduler Tools ──────────────────────────────────────────────────────────


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
    return await _request(context, "GET", "/api/v1/interactive/schedules", params=params)


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
    channel_id: Annotated[Optional[str], "YouTube channel ID or @handle (optional)"] = None,
) -> dict:
    """Create a new scan schedule."""
    body: dict[str, str] = {
        "scan_type": scan_type,
        "cron_expression": cron_expression,
    }
    if channel_id:
        body["channel_id"] = channel_id
    return await _request(context, "POST", "/api/v1/interactive/schedules", json=body)


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def delete_schedule(
    context: Context,
    schedule_id: Annotated[str, "ID of the schedule to delete"],
) -> dict:
    """Delete a scan schedule."""
    return await _request(context, "DELETE", f"/api/v1/interactive/schedules/{schedule_id}")


# ── Reporting Tools ──────────────────────────────────────────────────────────


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def get_channel_analytics(
    context: Context,
    channel_id_or_handle: Annotated[str, "YouTube channel ID (UC...) or @handle"],
    start_date: Annotated[Optional[str], "Start date in YYYY-MM-DD format"] = None,
    end_date: Annotated[Optional[str], "End date in YYYY-MM-DD format"] = None,
    page_token: Annotated[Optional[str], "Pagination token"] = None,
) -> dict:
    """Get channel analytics from the system's database.

    Returns daily channel-level metrics for the specified date range.
    This retrieves data already stored in the system, not from the YouTube API directly.
    Accepts a YouTube channel ID or @handle.
    """
    params = {}
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date
    if page_token:
        params["page_token"] = page_token
    return await _request(
        context, "GET", f"/api/v1/interactive/channels/{channel_id_or_handle}/analytics", params=params
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
    return await _request(context, "GET", f"/api/v1/interactive/videos/{video_id}/summary")


@app.tool(
    requires_auth=YT_ADMIN_AUTH,
    requires_secrets=["ELYSIA_BASE_URL"],
)
async def search_in_channel(
    context: Context,
    channel_id_or_handle: Annotated[str, "YouTube channel ID (UC...) or @handle"],
    query: Annotated[str, "Search query for transcript content"],
    page_token: Annotated[Optional[str], "Pagination token"] = None,
) -> dict:
    """Search video transcripts within a channel.

    Uses the indexed transcripts to find relevant content matching the query.
    Results include URLs to the transcription files.
    Accepts a YouTube channel ID or @handle.
    """
    params: dict[str, str] = {"q": query}
    if page_token:
        params["page_token"] = page_token
    return await _request(
        context, "GET", f"/api/v1/interactive/channels/{channel_id_or_handle}/search", params=params
    )


if __name__ == "__main__":
    transport = sys.argv[1] if len(sys.argv) > 1 else "stdio"
    app.run(transport=transport, host="127.0.0.1", port=8000)
