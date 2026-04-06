"""YouTube Transcript Proxy — fetches captions or transcribes audio behind Cloudflare WARP."""

import logging
import os
import subprocess

from fastapi import FastAPI, HTTPException, Request

from .captions import fetch_captions
from .whisper import transcribe_with_whisper

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="yt-proxy", version="1.0.0")

YT_PROXY_SECRET = os.environ.get("YT_PROXY_SECRET", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")


def _check_auth(request: Request) -> None:
    """Verify Bearer token matches the shared secret."""
    if not YT_PROXY_SECRET:
        return  # No secret configured = no auth (dev mode)
    auth = request.headers.get("authorization", "")
    if auth != f"Bearer {YT_PROXY_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health():
    """Health check — also reports WARP connectivity."""
    warp_connected = False
    try:
        result = subprocess.run(
            ["warp-cli", "status"], capture_output=True, text=True, timeout=5
        )
        warp_connected = "Connected" in result.stdout
    except Exception:
        pass
    return {"ok": True, "warp": warp_connected}


@app.get("/transcript/{video_id}")
async def get_transcript(video_id: str, request: Request):
    """Fetch transcript for a YouTube video.

    Tries YouTube captions first, falls back to yt-dlp + Whisper.
    """
    _check_auth(request)

    # Try captions first
    try:
        text = fetch_captions(video_id)
        if text:
            logger.info("Captions found for %s (%d chars)", video_id, len(text))
            return {"videoId": video_id, "text": text, "method": "captions"}
    except Exception as e:
        logger.warning("Caption fetch error for %s: %s", video_id, e)

    # Whisper fallback
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="No captions available and OPENAI_API_KEY not configured for Whisper fallback",
        )

    try:
        text = transcribe_with_whisper(video_id, OPENAI_API_KEY)
        logger.info("Whisper transcription for %s (%d chars)", video_id, len(text))
        return {"videoId": video_id, "text": text, "method": "whisper"}
    except Exception as e:
        logger.error("Whisper failed for %s: %s", video_id, e)
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}") from e
