"""Download YouTube audio with yt-dlp and transcribe with OpenAI Whisper."""

import logging
import subprocess
import tempfile
from pathlib import Path

from openai import OpenAI

logger = logging.getLogger(__name__)

WARP_PROXY = "socks5://127.0.0.1:1080"


def transcribe_with_whisper(video_id: str, openai_api_key: str) -> str:
    """Download audio via yt-dlp and transcribe with Whisper. Raises on failure."""
    with tempfile.TemporaryDirectory(prefix="yt-transcribe-") as temp_dir:
        audio_path = Path(temp_dir) / f"{video_id}.mp3"

        # Download audio
        cmd = [
            "yt-dlp",
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "5",
            "--proxy", WARP_PROXY,
            "-o", str(audio_path),
            "--no-playlist",
            "--", video_id,
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(f"yt-dlp failed (exit {result.returncode}): {result.stderr}")

        if not audio_path.exists():
            raise RuntimeError(f"yt-dlp did not produce audio file at {audio_path}")

        # Transcribe with Whisper
        client = OpenAI(api_key=openai_api_key)
        with open(audio_path, "rb") as f:
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
            )

        return response.text
