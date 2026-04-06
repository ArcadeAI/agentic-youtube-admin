"""Fetch YouTube captions via youtube-transcript-api, routed through WARP SOCKS5 proxy."""

import logging

import httpx
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import GenericProxies

logger = logging.getLogger(__name__)

WARP_PROXY = "socks5://127.0.0.1:1080"


def _build_proxies() -> GenericProxies | None:
    """Build proxy config if WARP is available."""
    try:
        transport = httpx.HTTPTransport(proxy=WARP_PROXY)
        client = httpx.Client(transport=transport, timeout=5)
        client.get("https://www.youtube.com", follow_redirects=True)
        client.close()
        return GenericProxies(WARP_PROXY)
    except Exception:
        logger.warning("WARP proxy not available, fetching captions without proxy")
        return None


def fetch_captions(video_id: str) -> str | None:
    """Fetch caption text for a video. Returns None if no captions available."""
    proxies = _build_proxies()

    try:
        ytt_api = YouTubeTranscriptApi(proxies=proxies) if proxies else YouTubeTranscriptApi()
        transcript = ytt_api.fetch(video_id, languages=["en"])

        # Join all snippet texts into a single string
        text = " ".join(snippet.text for snippet in transcript.snippets)
        return text.strip() if text.strip() else None

    except Exception as e:
        # Try any available language if English isn't found
        if "No transcripts were found" not in str(e) and "Could not retrieve" not in str(e):
            logger.warning("Caption fetch failed for %s: %s", video_id, e)
            return None

        try:
            ytt_api = YouTubeTranscriptApi(proxies=proxies) if proxies else YouTubeTranscriptApi()
            transcript_list = ytt_api.list(video_id)
            # Pick first available transcript
            for t in transcript_list:
                transcript = ytt_api.fetch(video_id, languages=[t.language_code])
                text = " ".join(snippet.text for snippet in transcript.snippets)
                if text.strip():
                    return text.strip()
            return None
        except Exception as e2:
            logger.warning("Caption fetch (any lang) failed for %s: %s", video_id, e2)
            return None
