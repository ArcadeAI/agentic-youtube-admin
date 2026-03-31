import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type { YouTubeService } from "../../modules/youtube/youtube.service";

function getYesterday(): string {
	const d = new Date();
	d.setDate(d.getDate() - 1);
	return d.toISOString().split("T")[0] as string;
}

const syncInputSchema = z.object({
	arcadeUserId: z.string(),
	channelDbId: z.string(),
});

export function createOwnedChannelDailySyncWorkflow(
	youtubeService: YouTubeService,
) {
	const syncChannelAnalytics = createStep({
		id: "sync-channel-analytics",
		inputSchema: syncInputSchema,
		outputSchema: z.object({
			arcadeUserId: z.string(),
			channelDbId: z.string(),
			date: z.string(),
			totalDays: z.number(),
		}),
		execute: async ({ inputData }) => {
			const { arcadeUserId, channelDbId } = inputData;
			const date = getYesterday();

			const result = await youtubeService.syncChannelAnalytics(
				"_workflow",
				arcadeUserId,
				channelDbId,
				date,
				date,
			);

			return {
				arcadeUserId,
				channelDbId,
				date,
				totalDays: result.totalDays,
			};
		},
	});

	const discoverNewVideos = createStep({
		id: "discover-new-videos",
		inputSchema: z.object({
			arcadeUserId: z.string(),
			channelDbId: z.string(),
			date: z.string(),
			totalDays: z.number(),
		}),
		outputSchema: z.object({
			arcadeUserId: z.string(),
			channelDbId: z.string(),
			date: z.string(),
			videoIds: z.array(z.string()),
			totalDiscovered: z.number(),
		}),
		execute: async ({ inputData }) => {
			const { arcadeUserId, channelDbId, date } = inputData;

			const result = await youtubeService.discoverAndSyncVideos(
				"_workflow",
				arcadeUserId,
				channelDbId,
			);

			const videoIds = await youtubeService.getVideoIdsForChannel(channelDbId);

			return {
				arcadeUserId,
				channelDbId,
				date,
				videoIds,
				totalDiscovered: result.totalDiscovered,
			};
		},
	});

	const backfillDailyAnalytics = createStep({
		id: "backfill-daily-analytics",
		inputSchema: z.object({
			arcadeUserId: z.string(),
			channelDbId: z.string(),
			date: z.string(),
			videoIds: z.array(z.string()),
			totalDiscovered: z.number(),
		}),
		outputSchema: z.object({
			channelDbId: z.string(),
			totalUpserted: z.number(),
		}),
		execute: async ({ inputData }) => {
			const { arcadeUserId, channelDbId, date, videoIds } = inputData;

			const result = await youtubeService.backfillVideoAnalytics(
				"_workflow",
				arcadeUserId,
				videoIds,
				date,
				date,
			);

			return {
				channelDbId,
				totalUpserted: result.totalUpserted,
			};
		},
	});

	const markComplete = createStep({
		id: "mark-sync-complete",
		inputSchema: z.object({
			channelDbId: z.string(),
			totalUpserted: z.number(),
		}),
		outputSchema: z.object({
			completed: z.boolean(),
			totalUpserted: z.number(),
		}),
		execute: async ({ inputData }) => {
			await youtubeService.markSyncComplete(inputData.channelDbId);
			return {
				completed: true,
				totalUpserted: inputData.totalUpserted,
			};
		},
	});

	return createWorkflow({
		id: "owned-channel-daily-sync",
		inputSchema: syncInputSchema,
		outputSchema: z.object({
			completed: z.boolean(),
			totalUpserted: z.number(),
		}),
	})
		.then(syncChannelAnalytics)
		.then(discoverNewVideos)
		.then(backfillDailyAnalytics)
		.then(markComplete)
		.commit();
}
