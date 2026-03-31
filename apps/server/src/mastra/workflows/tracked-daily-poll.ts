import type { PrismaClient } from "@agentic-youtube-admin/db";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type { TrackingService } from "../../modules/tracking/tracking.service";

const pollInputSchema = z.object({
	userId: z.string(),
	arcadeUserId: z.string(),
});

const pollResultSchema = z.object({
	userId: z.string(),
	arcadeUserId: z.string(),
	channelsPolled: z.number(),
	channelsFailed: z.number(),
	errors: z.array(z.string()),
});

const finalResultSchema = z.object({
	channelsPolled: z.number(),
	channelsScored: z.number(),
	channelsFailed: z.number(),
	errors: z.array(z.string()),
});

export function createTrackedDailyPollWorkflow(
	trackingService: TrackingService,
	prisma: PrismaClient,
) {
	const loadAndPollChannels = createStep({
		id: "load-and-poll-channels",
		inputSchema: pollInputSchema,
		outputSchema: pollResultSchema,
		execute: async ({ inputData }) => {
			const { userId, arcadeUserId } = inputData;

			const channels = await prisma.trackedChannel.findMany({
				where: { userId, isActive: true },
				select: { id: true, channelTitle: true },
			});

			let channelsPolled = 0;
			let channelsFailed = 0;
			const errors: string[] = [];

			for (const channel of channels) {
				try {
					await trackingService.pollChannel(userId, arcadeUserId, channel.id);
					channelsPolled++;
				} catch (err) {
					channelsFailed++;
					errors.push(
						`${channel.channelTitle}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}

			return {
				userId,
				arcadeUserId,
				channelsPolled,
				channelsFailed,
				errors,
			};
		},
	});

	const scoreChannels = createStep({
		id: "score-channels",
		inputSchema: pollResultSchema,
		outputSchema: finalResultSchema,
		execute: async ({ inputData }) => {
			const { userId, arcadeUserId, channelsPolled, channelsFailed, errors } =
				inputData;

			const channels = await prisma.trackedChannel.findMany({
				where: { userId, isActive: true },
				select: { id: true, channelId: true, channelTitle: true },
			});

			let channelsScored = 0;
			const today = new Date();
			const sevenDaysAgo = new Date(today);
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

			for (const channel of channels) {
				try {
					const score = await trackingService.scoreChannel(
						arcadeUserId,
						channel.channelId,
						10,
					);
					await trackingService.saveEngagementScore(
						channel.id,
						score,
						"daily",
						sevenDaysAgo,
						today,
					);
					channelsScored++;
				} catch (err) {
					errors.push(
						`Score ${channel.channelTitle}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}

			return { channelsPolled, channelsScored, channelsFailed, errors };
		},
	});

	return createWorkflow({
		id: "tracked-daily-poll",
		inputSchema: pollInputSchema,
		outputSchema: finalResultSchema,
	})
		.then(loadAndPollChannels)
		.then(scoreChannels)
		.commit();
}
