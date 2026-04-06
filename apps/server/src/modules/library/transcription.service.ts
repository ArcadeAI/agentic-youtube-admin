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
		channelYtId: string,
		videoId: string,
		title: string,
	): Promise<TranscriptionResult> {
		// Defensive: check if already on disk
		const existing = await this.libraryService.readTranscription(
			channelYtId,
			videoId,
			title,
		);
		if (existing) {
			return { success: true, method: null };
		}

		const url = `${this.proxyUrl}/transcript/${videoId}`;
		const response = await fetch(url, {
			headers: this.proxySecret
				? { Authorization: `Bearer ${this.proxySecret}` }
				: {},
		});

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
			channelYtId,
			videoId,
			title,
			data.text,
		);

		return { success: true, method: data.method };
	}
}
