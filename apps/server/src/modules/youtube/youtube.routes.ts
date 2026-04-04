import {
	callTool,
	checkToolAuth,
	TOOL_NAMES,
	waitAndExecuteTool,
} from "@agentic-youtube-admin/arcade";
import { getMyChannelResponseSchema } from "@agentic-youtube-admin/arcade/schemas/channel-analytics";
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
			const session = await auth.api.getSession({
				headers: request.headers,
			});
			if (!session?.user) {
				return new Response("Unauthorized", { status: 401 });
			}

			const arcadeUserId = session.user.email;

			// Check if the user needs to authorize the tool
			const authCheck = await checkToolAuth(
				TOOL_NAMES.GET_MY_CHANNEL,
				arcadeUserId,
			);

			if (authCheck.needsAuth) {
				return {
					needsAuth: true,
					authUrl: authCheck.authUrl,
					authId: authCheck.authId,
				};
			}

			// Already authorized — execute directly
			const result = await callTool(
				TOOL_NAMES.GET_MY_CHANNEL,
				arcadeUserId,
				{},
				getMyChannelResponseSchema,
			);

			if (!result.ok) {
				throw result.error;
			}

			const channel = await service.saveChannel(session.user.id, result.data);
			return { connected: true, channel };
		})
		.post(
			"/channels/completeConnection",
			async ({ request, body }) => {
				const session = await auth.api.getSession({
					headers: request.headers,
				});
				if (!session?.user) {
					return new Response("Unauthorized", { status: 401 });
				}

				const arcadeUserId = session.user.email;

				// Wait for pending auth to complete, then execute
				const result = await waitAndExecuteTool(
					body.authId,
					TOOL_NAMES.GET_MY_CHANNEL,
					arcadeUserId,
					{},
					getMyChannelResponseSchema,
				);

				if (!result.ok) {
					throw result.error;
				}

				const channel = await service.saveChannel(session.user.id, result.data);
				return { connected: true, channel };
			},
			{
				body: t.Object({
					authId: t.String(),
				}),
			},
		)
		.post(
			"/channels/sync",
			async ({ body }) => {
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

				const errors: Array<{ step: string; message: string }> = [];

				let videoResult = null;
				try {
					videoResult = await service.discoverAndSyncVideos(
						body.userId,
						body.arcadeUserId,
						channel.id,
					);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					console.error("[sync] discoverAndSyncVideos failed:", msg);
					errors.push({ step: "discoverVideos", message: msg });
				}

				let analyticsResult = null;
				try {
					analyticsResult = await service.syncChannelAnalytics(
						body.userId,
						body.arcadeUserId,
						channel.id,
						startDate,
						endDate,
					);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					console.error("[sync] syncChannelAnalytics failed:", msg);
					errors.push({ step: "channelAnalytics", message: msg });
				}

				let videoAnalyticsResult = null;
				try {
					const ytVideoIds = await service.getVideoIdsForChannel(channel.id);
					if (ytVideoIds.length > 0) {
						videoAnalyticsResult = await service.backfillVideoAnalytics(
							body.userId,
							body.arcadeUserId,
							ytVideoIds,
							startDate,
							endDate,
						);
					}
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					console.error("[sync] backfillVideoAnalytics failed:", msg);
					errors.push({ step: "videoAnalytics", message: msg });
				}

				await service.markSyncComplete(channel.id);

				return {
					videos: videoResult,
					channelAnalytics: analyticsResult,
					videoAnalytics: videoAnalyticsResult,
					errors: errors.length > 0 ? errors : undefined,
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
