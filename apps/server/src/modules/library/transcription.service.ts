import type { LibraryService } from "./library.service";

interface TranscriptionResult {
	success: boolean;
	method: "captions" | "whisper" | null;
}

export class TranscriptionService {
	constructor(
		private libraryService: LibraryService,
		private proxyUrl: string,
		private proxySecret: string,
	) {}

	/**
	 * Transcribe a single video via the yt-proxy service.
	 * Returns early if the video is already transcribed on disk.
	 */
	async transcribeVideo(
		channelSlug: string,
		videoId: string,
		title: string,
		publishedAt: Date,
		description?: string,
	): Promise<TranscriptionResult> {
		// Defensive: check if already on disk
		const existing = await this.libraryService.readTranscription(
			channelSlug,
			videoId,
			title,
			publishedAt,
		);
		if (existing) {
			return { success: true, method: null };
		}

		const url = `${this.proxyUrl}/transcript/${videoId}`;

		// Whisper transcription of long videos can take several minutes.
		// 15 minutes covers yt-dlp download (up to 5 min) + Whisper processing.
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 15 * 60 * 1000);

		let response: Response;
		try {
			response = await fetch(url, {
				headers: this.proxySecret
					? { Authorization: `Bearer ${this.proxySecret}` }
					: {},
				signal: controller.signal,
			});
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") {
				throw new Error(
					`Transcript proxy timed out for ${videoId} after 15 minutes`,
				);
			}
			throw err;
		} finally {
			clearTimeout(timeoutId);
		}

		if (!response.ok) {
			const detail = await response.text().catch(() => "unknown error");
			throw new Error(
				`Transcript proxy failed for ${videoId}: ${response.status} ${detail}`,
			);
		}

		const data = (await response.json()) as {
			videoId: string;
			text: string;
			method: "captions" | "whisper";
		};

		await this.libraryService.writeTranscription(
			channelSlug,
			videoId,
			title,
			publishedAt,
			data.text,
		);

		if (description) {
			await this.libraryService.writeDescription(
				channelSlug,
				videoId,
				title,
				publishedAt,
				description,
			);
		}

		return { success: true, method: data.method };
	}
}
