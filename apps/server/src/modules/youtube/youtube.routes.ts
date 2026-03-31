import { startAuthFlow } from "@agentic-youtube-admin/arcade";
import { auth } from "@agentic-youtube-admin/auth";
import { Elysia, t } from "elysia";
import type { YouTubeService } from "./youtube.service";

export function createYouTubeRoutes(service: YouTubeService) {
	return new Elysia({ prefix: "/api/youtube" })
		.get(
			"/channels",
			async ({ query }) => {
				return service.listChannels(query.userId);
			},
			{
				query: t.Object({
					userId: t.String(),
				}),
			},
		)
		.post("/channels/connect", async ({ request }) => {
			// Get current user from session
			const session = await auth.api.getSession({
				headers: request.headers,
			});
			if (!session?.user) {
				return new Response("Unauthorized", { status: 401 });
			}

			// Start Arcade OAuth flow using the user's email as Arcade user ID
			const authUrl = await startAuthFlow(session.user.email);
			return { authUrl };
		})
		.post(
			"/channels/sync",
			async ({ body }) => {
				// Called after OAuth is complete to sync channel data
				return service.connectChannel(body.userId, body.arcadeUserId);
			},
			{
				body: t.Object({
					userId: t.String(),
					arcadeUserId: t.String(),
				}),
			},
		)
		.get(
			"/channels/:channelId/videos",
			async ({ params, query }) => {
				const page = query.page ? Number(query.page) : 1;
				const pageSize = query.pageSize ? Number(query.pageSize) : 50;
				return service.listVideos(params.channelId, page, pageSize);
			},
			{
				params: t.Object({ channelId: t.String() }),
				query: t.Object({
					page: t.Optional(t.String()),
					pageSize: t.Optional(t.String()),
				}),
			},
		)
		.get(
			"/channels/:channelId/analytics",
			async ({ params, query }) => {
				const stats = await service.getChannelDailyStats(
					params.channelId,
					query.startDate,
					query.endDate,
				);
				return { data: stats };
			},
			{
				params: t.Object({ channelId: t.String() }),
				query: t.Object({
					startDate: t.String(),
					endDate: t.String(),
				}),
			},
		)
		.get(
			"/videos/:videoId/analytics",
			async ({ params, query }) => {
				const stats = await service.getVideoDailyStats(
					params.videoId,
					query.startDate,
					query.endDate,
				);
				return { data: stats };
			},
			{
				params: t.Object({ videoId: t.String() }),
				query: t.Object({
					startDate: t.String(),
					endDate: t.String(),
				}),
			},
		)
		.get(
			"/videos/:videoId/retention",
			async ({ params }) => {
				const points = await service.getRetentionData(params.videoId);
				return { data: points };
			},
			{
				params: t.Object({ videoId: t.String() }),
			},
		)
		.post(
			"/channels/:channelId/sync",
			async ({ params, body }) => {
				const channel = await service.getChannel(params.channelId);

				const startDate =
					body.startDate ??
					new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
						.toISOString()
						.slice(0, 10);
				const endDate = body.endDate ?? new Date().toISOString().slice(0, 10);

				const videoResult = await service.discoverAndSyncVideos(
					body.userId,
					body.arcadeUserId,
					channel.id,
				);

				const analyticsResult = await service.syncChannelAnalytics(
					body.userId,
					body.arcadeUserId,
					channel.id,
					startDate,
					endDate,
				);

				const ytVideoIds = await service.getVideoIdsForChannel(channel.id);

				let videoAnalyticsResult = null;
				if (ytVideoIds.length > 0) {
					videoAnalyticsResult = await service.backfillVideoAnalytics(
						body.userId,
						body.arcadeUserId,
						ytVideoIds,
						startDate,
						endDate,
					);
				}

				await service.markSyncComplete(channel.id);

				return {
					videos: videoResult,
					channelAnalytics: analyticsResult,
					videoAnalytics: videoAnalyticsResult,
				};
			},
			{
				params: t.Object({ channelId: t.String() }),
				body: t.Object({
					userId: t.String(),
					arcadeUserId: t.String(),
					startDate: t.Optional(t.String()),
					endDate: t.Optional(t.String()),
				}),
			},
		);
}
