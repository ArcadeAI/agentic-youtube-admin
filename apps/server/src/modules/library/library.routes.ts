import { auth } from "@agentic-youtube-admin/auth";
import type { PrismaClient } from "@agentic-youtube-admin/db";
import { Elysia, t } from "elysia";
import type { LibraryService } from "./library.service";
import { slugify } from "./library.service";

async function resolveVideoAccess(
	db: PrismaClient,
	userId: string,
	channelYtId: string,
	videoId: string,
): Promise<{
	channelSlug: string;
	title: string;
	publishedAt: Date;
} | null> {
	// Check owned channels first
	const ownedVideo = await db.video.findFirst({
		where: {
			videoId,
			channel: {
				channelId: channelYtId,
				userId,
			},
		},
		select: {
			title: true,
			publishedAt: true,
			channel: { select: { customUrl: true, channelTitle: true } },
		},
	});

	if (ownedVideo) {
		return {
			channelSlug: slugify(
				ownedVideo.channel.customUrl ?? ownedVideo.channel.channelTitle,
			),
			title: ownedVideo.title,
			publishedAt: ownedVideo.publishedAt,
		};
	}

	// Check tracked channels
	const trackedVideo = await db.trackedVideo.findFirst({
		where: {
			videoId,
			channel: {
				channelId: channelYtId,
				userId,
			},
		},
		select: {
			title: true,
			publishedAt: true,
			channel: { select: { customUrl: true, channelTitle: true } },
		},
	});

	if (trackedVideo) {
		return {
			channelSlug: slugify(
				trackedVideo.channel.customUrl ?? trackedVideo.channel.channelTitle,
			),
			title: trackedVideo.title,
			publishedAt: trackedVideo.publishedAt,
		};
	}

	return null;
}

export function createLibraryRoutes(service: LibraryService, db: PrismaClient) {
	return new Elysia({ prefix: "/api/library" })
		.get(
			"/channels/:channelYtId/transcriptions",
			async ({ params, request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session?.user) {
					return new Response("Unauthorized", { status: 401 });
				}

				// Return only video IDs for which the user has access in this channel
				const [ownedVideos, trackedVideos] = await Promise.all([
					db.video.findMany({
						where: {
							channel: {
								channelId: params.channelYtId,
								userId: session.user.id,
							},
							transcribedAt: { not: null },
						},
						select: {
							videoId: true,
							title: true,
							publishedAt: true,
							channel: { select: { customUrl: true, channelTitle: true } },
						},
					}),
					db.trackedVideo.findMany({
						where: {
							channel: {
								channelId: params.channelYtId,
								userId: session.user.id,
							},
							transcribedAt: { not: null },
						},
						select: {
							videoId: true,
							title: true,
							publishedAt: true,
							channel: { select: { customUrl: true, channelTitle: true } },
						},
					}),
				]);

				const toEntry = (v: {
					videoId: string;
					title: string;
					publishedAt: Date;
					channel: { customUrl: string | null; channelTitle: string };
				}) => ({
					videoId: v.videoId,
					filename: service.getTranscriptionFilename(
						v.videoId,
						v.title,
						v.publishedAt,
					),
					channelSlug: slugify(v.channel.customUrl ?? v.channel.channelTitle),
				});

				const seen = new Set<string>();
				const results = [];
				for (const v of [...ownedVideos, ...trackedVideos]) {
					if (!seen.has(v.videoId)) {
						seen.add(v.videoId);
						results.push(toEntry(v));
					}
				}
				return results;
			},
			{
				params: t.Object({ channelYtId: t.String() }),
			},
		)
		.get(
			"/channels/:channelYtId/videos/:videoId/transcript",
			async ({ params, request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session?.user) {
					return new Response("Unauthorized", { status: 401 });
				}

				const access = await resolveVideoAccess(
					db,
					session.user.id,
					params.channelYtId,
					params.videoId,
				);
				if (!access) {
					return new Response("Forbidden", { status: 403 });
				}

				const filename = service.getTranscriptionFilename(
					params.videoId,
					access.title,
					access.publishedAt,
				);
				const content = await service.readFileContent(
					access.channelSlug,
					filename,
				);
				if (content === null) {
					return new Response("Transcript not found", { status: 404 });
				}

				return new Response(content, {
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			},
			{
				params: t.Object({ channelYtId: t.String(), videoId: t.String() }),
			},
		)
		.get(
			"/channels/:channelYtId/videos/:videoId/description",
			async ({ params, request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session?.user) {
					return new Response("Unauthorized", { status: 401 });
				}

				const access = await resolveVideoAccess(
					db,
					session.user.id,
					params.channelYtId,
					params.videoId,
				);
				if (!access) {
					return new Response("Forbidden", { status: 403 });
				}

				const filename = service.getDescriptionFilename(
					params.videoId,
					access.title,
					access.publishedAt,
				);
				const content = await service.readFileContent(
					access.channelSlug,
					filename,
				);
				if (content === null) {
					return new Response("Description not found", { status: 404 });
				}

				return new Response(content, {
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			},
			{
				params: t.Object({ channelYtId: t.String(), videoId: t.String() }),
			},
		)
		.get(
			"/channels/:channelYtId/search",
			async ({ params, query, request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session?.user) {
					return new Response("Unauthorized", { status: 401 });
				}
				return service.searchTranscripts(params.channelYtId, query.q);
			},
			{
				params: t.Object({ channelYtId: t.String() }),
				query: t.Object({ q: t.String() }),
			},
		);
}
