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
		);
}
