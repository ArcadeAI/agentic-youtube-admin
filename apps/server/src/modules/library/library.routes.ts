import { Elysia, t } from "elysia";
import type { LibraryService } from "./library.service";

export function createLibraryRoutes(service: LibraryService) {
	return new Elysia({ prefix: "/api/library" })
		.get(
			"/channels/:channelId/transcriptions",
			async ({ params }) => {
				return service.listTranscriptions(params.channelId);
			},
			{
				params: t.Object({ channelId: t.String() }),
			},
		)
		.get(
			"/channels/:channelId/search",
			async ({ params, query }) => {
				return service.searchTranscripts(params.channelId, query.q);
			},
			{
				params: t.Object({ channelId: t.String() }),
				query: t.Object({ q: t.String() }),
			},
		)
		.get(
			"/channels/:channelId/transcriptions/:filename",
			async ({ params }) => {
				// Extract videoId and title from filename pattern: slug_videoId.md
				const match = params.filename.match(/^(.+)_([^_]+)\.md$/);
				if (!match) {
					return new Response("Invalid filename format", { status: 400 });
				}
				const [, , videoId] = match;

				// Read by listing files and finding the matching one
				const files = await service.listTranscriptions(params.channelId);
				const file = files.find((f) => f === params.filename);
				if (!file) {
					return new Response("Transcription not found", { status: 404 });
				}

				// Read the file content using the channelId directory and filename
				const { readFile } = await import("node:fs/promises");
				const { join } = await import("node:path");
				const filePath = join(
					process.cwd(),
					"transcriptions",
					`channel_${params.channelId}`,
					params.filename,
				);
				try {
					const content = await readFile(filePath, "utf-8");
					return new Response(content, {
						headers: {
							"Content-Type": "text/markdown; charset=utf-8",
							"X-Video-Id": videoId ?? "",
						},
					});
				} catch {
					return new Response("Transcription not found", { status: 404 });
				}
			},
			{
				params: t.Object({
					channelId: t.String(),
					filename: t.String(),
				}),
			},
		);
}
