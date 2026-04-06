import type { PrismaClient } from "@agentic-youtube-admin/db";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type { TranscriptionService } from "../../modules/library/transcription.service";
import type { TrackingService } from "../../modules/tracking/tracking.service";
import type { YouTubeService } from "../../modules/youtube/youtube.service";

const transcriptionInputSchema = z.object({
	userId: z.string(),
	channelDbId: z.string().optional(),
	trackedChannelId: z.string().optional(),
	scope: z.enum(["owned", "tracked", "all"]),
	videoId: z.string().optional(),
	limit: z.number().optional(),
});

const afterOwnedSchema = z.object({
	userId: z.string(),
	channelDbId: z.string().optional(),
	trackedChannelId: z.string().optional(),
	scope: z.enum(["owned", "tracked", "all"]),
	videoId: z.string().optional(),
	limit: z.number().optional(),
	ownedTranscribed: z.number(),
	errors: z.array(z.string()),
});

const transcriptionOutputSchema = z.object({
	ownedTranscribed: z.number(),
	trackedTranscribed: z.number(),
	errors: z.array(z.string()),
});

export function createTranscriptionWorkflow(
	youtubeService: YouTubeService,
	trackingService: TrackingService,
	transcriptionService: TranscriptionService,
	prisma: PrismaClient,
) {
	const transcribeOwned = createStep({
		id: "transcribe-owned",
		inputSchema: transcriptionInputSchema,
		outputSchema: afterOwnedSchema,
		execute: async ({ inputData }) => {
			const { userId, channelDbId, scope, videoId, limit } = inputData;

			if (scope === "tracked") {
				return { ...inputData, ownedTranscribed: 0, errors: [] };
			}

			const errors: string[] = [];
			let ownedTranscribed = 0;

			const channels = channelDbId
				? [{ id: channelDbId }]
				: await prisma.youTubeChannel.findMany({
						where: { userId },
						select: { id: true },
					});

			for (const channel of channels) {
				try {
					const result = await youtubeService.transcribeVideos(
						channel.id,
						transcriptionService,
						{ videoId, limit },
					);
					ownedTranscribed += result.transcribed;
					if (result.failed > 0) {
						errors.push(`Owned channel ${channel.id}: ${result.failed} failed`);
					}
				} catch (err) {
					errors.push(
						`Owned ${channel.id}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}

			return { ...inputData, ownedTranscribed, errors };
		},
	});

	const transcribeTracked = createStep({
		id: "transcribe-tracked",
		inputSchema: afterOwnedSchema,
		outputSchema: transcriptionOutputSchema,
		execute: async ({ inputData }) => {
			const {
				userId,
				trackedChannelId,
				scope,
				videoId,
				limit,
				ownedTranscribed,
				errors,
			} = inputData;

			if (scope === "owned") {
				return { ownedTranscribed, trackedTranscribed: 0, errors };
			}

			let trackedTranscribed = 0;

			const channels = trackedChannelId
				? [{ id: trackedChannelId }]
				: await prisma.trackedChannel.findMany({
						where: { userId, isActive: true },
						select: { id: true },
					});

			for (const channel of channels) {
				try {
					const result = await trackingService.transcribeTrackedVideos(
						channel.id,
						transcriptionService,
						{ videoId, limit },
					);
					trackedTranscribed += result.transcribed;
					if (result.failed > 0) {
						errors.push(
							`Tracked channel ${channel.id}: ${result.failed} failed`,
						);
					}
				} catch (err) {
					errors.push(
						`Tracked ${channel.id}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}

			return { ownedTranscribed, trackedTranscribed, errors };
		},
	});

	return createWorkflow({
		id: "transcription",
		inputSchema: transcriptionInputSchema,
		outputSchema: transcriptionOutputSchema,
	})
		.then(transcribeOwned)
		.then(transcribeTracked)
		.commit();
}
