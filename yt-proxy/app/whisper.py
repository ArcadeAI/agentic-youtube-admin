"""Download YouTube audio with yt-dlp and transcribe with OpenAI Whisper."""

import logging
import math
import subprocess
import tempfile
from pathlib import Path

from openai import OpenAI

logger = logging.getLogger(__name__)

WARP_PROXY = "socks5://127.0.0.1:1080"

# OpenAI Whisper API hard limit is 25 MB; use 24 MB to leave a safety margin.
WHISPER_MAX_BYTES = 24 * 1024 * 1024


def _get_duration(audio_path: Path) -> float:
    """Return audio duration in seconds via ffprobe."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    return float(result.stdout.strip())


def _split_audio(audio_path: Path, temp_dir: str) -> list[Path]:
    """Split audio into chunks that each fit within WHISPER_MAX_BYTES.

    Returns a list containing the original path when no splitting is needed.
    Uses ffmpeg stream copy (no re-encode) so splits are fast.
    """
    file_size = audio_path.stat().st_size
    if file_size <= WHISPER_MAX_BYTES:
        return [audio_path]

    duration = _get_duration(audio_path)
    bytes_per_second = file_size / duration
    # 5 % safety margin so each chunk lands comfortably under the limit.
    chunk_seconds = (WHISPER_MAX_BYTES / bytes_per_second) * 0.95
    num_chunks = math.ceil(duration / chunk_seconds)

    logger.info(
        "Audio for video is %.1f MB — splitting into %d chunks of ~%.0fs each",
        file_size / 1024 / 1024,
        num_chunks,
        chunk_seconds,
    )

    chunks: list[Path] = []
    for i in range(num_chunks):
        chunk_path = Path(temp_dir) / f"chunk_{i:03d}.mp3"
        start = i * chunk_seconds
        subprocess.run(
            [
                "ffmpeg",
                "-i", str(audio_path),
                "-ss", str(start),
                "-t", str(chunk_seconds),
                "-c", "copy",
                str(chunk_path),
            ],
            capture_output=True,
            timeout=120,
            check=True,
        )
        chunks.append(chunk_path)

    return chunks


def transcribe_with_whisper(video_id: str, openai_api_key: str) -> str:
    """Download audio via yt-dlp and transcribe with Whisper. Raises on failure."""
    with tempfile.TemporaryDirectory(prefix="yt-transcribe-") as temp_dir:
        audio_path = Path(temp_dir) / f"{video_id}.mp3"

        # Download audio
        cmd = [
            "yt-dlp",
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "9",
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

        chunks = _split_audio(audio_path, temp_dir)

        client = OpenAI(api_key=openai_api_key)
        texts: list[str] = []
        for chunk in chunks:
            with open(chunk, "rb") as f:
                response = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                )
            texts.append(response.text)

        return " ".join(texts)
