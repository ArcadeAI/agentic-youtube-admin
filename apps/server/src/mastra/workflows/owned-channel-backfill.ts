import type { PrismaClient } from "@agentic-youtube-admin/db";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type { YouTubeService } from "../../modules/youtube/youtube.service";

const backfillInputSchema = z.object({
	arcadeUserId: z.string(),
	channelDbId: z.string(),
	startDate: z.string(),
	endDate: z.string(),
});

const discoverOutputSchema = z.object({
	arcadeUserId: z.string(),
	channelDbId: z.string(),
	startDate: z.string(),
	endDate: z.string(),
	videoIds: z.array(z.string()),
	liveVideoIds: z.array(z.string()),
	totalDiscovered: z.number(),
});

const backfillStepOutputSchema = z.object({
	totalUpserted: z.number(),
});

const retentionOutputSchema = z.object({
	retentionPointsTotal: z.number(),
	liveTimelinePointsTotal: z.number(),
});

export function createOwnedChannelBackfillWorkflow(
	youtubeService: YouTubeService,
	prisma: PrismaClient,
) {
	const discoverVideos = createStep({
		id: "discover-videos",
		inputSchema: backfillInputSchema,
		outputSchema: discoverOutputSchema,
		execute: async ({ inputData }) => {
			const { arcadeUserId, channelDbId, startDate, endDate } = inputData;

			const result = await youtubeService.discoverAndSyncVideos(
				"_workflow",
				arcadeUserId,
				channelDbId,
			);

			const allVideoIds =
				await youtubeService.getVideoIdsForChannel(channelDbId);

			const liveVideos = await prisma.video.findMany({
				where: { channelId: channelDbId, contentType: "LIVE" },
				select: { videoId: true },
			});

			return {
				arcadeUserId,
				channelDbId,
				startDate,
				endDate,
				videoIds: allVideoIds,
				liveVideoIds: liveVideos.map((v) => v.videoId),
				totalDiscovered: result.totalDiscovered,
			};
		},
	});

	const backfillAnalytics = createStep({
		id: "backfill-analytics",
		inputSchema: discoverOutputSchema,
		outputSchema: backfillStepOutputSchema,
		execute: async ({ inputData }) => {
			const result = await youtubeService.backfillVideoAnalytics(
				"_workflow",
				inputData.arcadeUserId,
				inputData.videoIds,
				inputData.startDate,
				inputData.endDate,
			);
			return { totalUpserted: result.totalUpserted };
		},
	});

	const backfillTraffic = createStep({
		id: "backfill-traffic",
		inputSchema: discoverOutputSchema,
		outputSchema: backfillStepOutputSchema,
		execute: async ({ inputData }) => {
			const result = await youtubeService.backfillTrafficSources(
				"_workflow",
				inputData.arcadeUserId,
				inputData.videoIds,
				inputData.startDate,
				inputData.endDate,
			);
			return { totalUpserted: result.totalUpserted };
		},
	});

	const backfillDevices = createStep({
		id: "backfill-devices",
		inputSchema: discoverOutputSchema,
		outputSchema: backfillStepOutputSchema,
		execute: async ({ inputData }) => {
			const result = await youtubeService.backfillDeviceStats(
				"_workflow",
				inputData.arcadeUserId,
				inputData.videoIds,
				inputData.startDate,
				inputData.endDate,
			);
			return { totalUpserted: result.totalUpserted };
		},
	});

	const getRetentionAndTimelines = createStep({
		id: "get-retention-and-timelines",
		inputSchema: z.object({
			"backfill-analytics": backfillStepOutputSchema,
			"backfill-traffic": backfillStepOutputSchema,
			"backfill-devices": backfillStepOutputSchema,
		}),
		outputSchema: retentionOutputSchema,
		execute: async ({ getStepResult }) => {
			const discoverResult = await getStepResult("discover-videos");
			const { arcadeUserId, startDate, endDate, videoIds, liveVideoIds } =
				discoverResult as z.infer<typeof discoverOutputSchema>;

			// Get retention curves for non-live videos
			const nonLiveIds = videoIds.filter((id) => !liveVideoIds.includes(id));
			let retentionPointsTotal = 0;
			for (const videoId of nonLiveIds) {
				try {
					const result = await youtubeService.getRetentionCurve(
						"_workflow",
						arcadeUserId,
						videoId,
						startDate,
						endDate,
					);
					retentionPointsTotal += result.totalPoints;
				} catch {
					// Retention data may not be available for all videos
				}
			}

			// Get live stream timelines
			let liveTimelinePointsTotal = 0;
			for (const videoId of liveVideoIds) {
				try {
					const video = await prisma.video.findUnique({
						where: { videoId },
						select: { publishedAt: true },
					});
					if (!video) continue;

					const streamDate = video.publishedAt
						.toISOString()
						.split("T")[0] as string;
					const result = await youtubeService.getLiveStreamTimeline(
						"_workflow",
						arcadeUserId,
						videoId,
						streamDate,
					);
					liveTimelinePointsTotal += result.totalPoints;
				} catch {
					// Timeline data may not be available
				}
			}

			return { retentionPointsTotal, liveTimelinePointsTotal };
		},
	});

	const markComplete = createStep({
		id: "mark-complete",
		inputSchema: retentionOutputSchema,
		outputSchema: z.object({
			completed: z.boolean(),
			retentionPointsTotal: z.number(),
			liveTimelinePointsTotal: z.number(),
		}),
		execute: async ({ inputData, getStepResult }) => {
			const discoverResult = await getStepResult("discover-videos");
			const { channelDbId } = discoverResult as z.infer<
				typeof discoverOutputSchema
			>;
			await youtubeService.markSyncComplete(channelDbId);
			return {
				completed: true,
				retentionPointsTotal: inputData.retentionPointsTotal,
				liveTimelinePointsTotal: inputData.liveTimelinePointsTotal,
			};
		},
	});

	return createWorkflow({
		id: "owned-channel-backfill",
		inputSchema: backfillInputSchema,
		outputSchema: z.object({
			completed: z.boolean(),
			retentionPointsTotal: z.number(),
			liveTimelinePointsTotal: z.number(),
		}),
	})
		.then(discoverVideos)
		.parallel([backfillAnalytics, backfillTraffic, backfillDevices])
		.then(getRetentionAndTimelines)
		.then(markComplete)
		.commit();
}
