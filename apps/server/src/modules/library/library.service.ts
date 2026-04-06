import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@agentic-youtube-admin/env/server";

function getTranscriptRoot(): string {
	return env.TRANSCRIPT_ROOT ?? join(process.cwd(), "transcriptions");
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function buildFileStem(
	videoId: string,
	title: string,
	publishedAt: Date,
): string {
	const dateStr = formatDate(publishedAt);
	const titleSlug = slugify(title);
	return `${dateStr}_${titleSlug}_${videoId}`;
}

export class LibraryService {
	async writeTranscription(
		channelSlug: string,
		videoId: string,
		title: string,
		publishedAt: Date,
		content: string,
	): Promise<string> {
		const channelDir = join(getTranscriptRoot(), channelSlug);
		await mkdir(channelDir, { recursive: true });

		const filename = `${buildFileStem(videoId, title, publishedAt)}-transcript.txt`;
		const filePath = join(channelDir, filename);

		await writeFile(filePath, content, "utf-8");
		return filePath;
	}

	async writeDescription(
		channelSlug: string,
		videoId: string,
		title: string,
		publishedAt: Date,
		content: string,
	): Promise<string> {
		const channelDir = join(getTranscriptRoot(), channelSlug);
		await mkdir(channelDir, { recursive: true });

		const filename = `${buildFileStem(videoId, title, publishedAt)}-description.txt`;
		const filePath = join(channelDir, filename);

		await writeFile(filePath, content, "utf-8");
		return filePath;
	}

	async readTranscription(
		channelSlug: string,
		videoId: string,
		title: string,
		publishedAt: Date,
	): Promise<string | null> {
		const filename = `${buildFileStem(videoId, title, publishedAt)}-transcript.txt`;
		const filePath = join(getTranscriptRoot(), channelSlug, filename);

		try {
			return await readFile(filePath, "utf-8");
		} catch {
			return null;
		}
	}

	async readFileContent(
		channelSlug: string,
		filename: string,
	): Promise<string | null> {
		const filePath = join(getTranscriptRoot(), channelSlug, filename);
		try {
			return await readFile(filePath, "utf-8");
		} catch {
			return null;
		}
	}

	async listTranscriptions(channelSlug: string): Promise<string[]> {
		const channelDir = join(getTranscriptRoot(), channelSlug);
		try {
			const files = await readdir(channelDir);
			return files.filter((f) => f.endsWith("-transcript.txt"));
		} catch {
			return [];
		}
	}

	getTranscriptionFilename(
		videoId: string,
		title: string,
		publishedAt: Date,
	): string {
		return `${buildFileStem(videoId, title, publishedAt)}-transcript.txt`;
	}

	getDescriptionFilename(
		videoId: string,
		title: string,
		publishedAt: Date,
	): string {
		return `${buildFileStem(videoId, title, publishedAt)}-description.txt`;
	}

	async searchTranscripts(
		_channelSlug: string,
		_query: string,
	): Promise<Array<{ videoId: string; snippet: string; url: string }>> {
		// TODO: Integrate with arcade-library for full-text search
		return [];
	}
}
