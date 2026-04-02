import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TRANSCRIPTIONS_DIR = join(process.cwd(), "transcriptions");

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

export class LibraryService {
	async writeTranscription(
		channelId: string,
		videoId: string,
		title: string,
		content: string,
	): Promise<string> {
		const channelDir = join(TRANSCRIPTIONS_DIR, `channel_${channelId}`);
		await mkdir(channelDir, { recursive: true });

		const slug = slugify(title);
		const filename = `${slug}_${videoId}.md`;
		const filePath = join(channelDir, filename);

		await writeFile(filePath, content, "utf-8");
		return filePath;
	}

	async readTranscription(
		channelId: string,
		videoId: string,
		title: string,
	): Promise<string | null> {
		const slug = slugify(title);
		const filePath = join(
			TRANSCRIPTIONS_DIR,
			`channel_${channelId}`,
			`${slug}_${videoId}.md`,
		);

		try {
			return await readFile(filePath, "utf-8");
		} catch {
			return null;
		}
	}

	async listTranscriptions(channelId: string): Promise<string[]> {
		const channelDir = join(TRANSCRIPTIONS_DIR, `channel_${channelId}`);
		try {
			const files = await readdir(channelDir);
			return files.filter((f) => f.endsWith(".md"));
		} catch {
			return [];
		}
	}

	getTranscriptionUrl(
		baseUrl: string,
		channelId: string,
		videoId: string,
		title: string,
	): string {
		const slug = slugify(title);
		return `${baseUrl}/transcriptions/channel_${channelId}/${slug}_${videoId}.md`;
	}

	async searchTranscripts(
		_channelId: string,
		_query: string,
	): Promise<Array<{ videoId: string; snippet: string; url: string }>> {
		// TODO: Integrate with arcade-library for full-text search
		// For now, return empty results
		return [];
	}
}
