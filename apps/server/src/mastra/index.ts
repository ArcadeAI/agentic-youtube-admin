import type { PrismaClient } from "@agentic-youtube-admin/db";
import { Mastra } from "@mastra/core";
import type { TranscriptionService } from "../modules/library/transcription.service";
import type { TrackingService } from "../modules/tracking/tracking.service";
import type { YouTubeService } from "../modules/youtube/youtube.service";
import { createOwnedChannelBackfillWorkflow } from "./workflows/owned-channel-backfill";
import { createOwnedChannelDailySyncWorkflow } from "./workflows/owned-channel-daily-sync";
import { createTrackedDailyPollWorkflow } from "./workflows/tracked-daily-poll";
import { createTranscriptionWorkflow } from "./workflows/transcription";

export function createMastraInstance(
	youtubeService: YouTubeService,
	trackingService: TrackingService,
	prisma: PrismaClient,
	transcriptionService: TranscriptionService,
) {
	const ownedChannelBackfill = createOwnedChannelBackfillWorkflow(
		youtubeService,
		prisma,
	);
	const ownedChannelDailySync =
		createOwnedChannelDailySyncWorkflow(youtubeService);
	const trackedDailyPoll = createTrackedDailyPollWorkflow(
		trackingService,
		prisma,
	);
	const transcription = createTranscriptionWorkflow(
		youtubeService,
		trackingService,
		transcriptionService,
		prisma,
	);

	const mastra = new Mastra({
		workflows: {
			ownedChannelBackfill,
			ownedChannelDailySync,
			trackedDailyPoll,
			transcription,
		},
	});

	return mastra;
}
