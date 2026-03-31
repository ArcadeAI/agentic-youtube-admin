import type { PrismaClient } from "@agentic-youtube-admin/db";
import { Mastra } from "@mastra/core";
import type { TrackingService } from "../modules/tracking/tracking.service";
import type { YouTubeService } from "../modules/youtube/youtube.service";
import { createOwnedChannelBackfillWorkflow } from "./workflows/owned-channel-backfill";
import { createOwnedChannelDailySyncWorkflow } from "./workflows/owned-channel-daily-sync";
import { createTrackedDailyPollWorkflow } from "./workflows/tracked-daily-poll";

export function createMastraInstance(
	youtubeService: YouTubeService,
	trackingService: TrackingService,
	prisma: PrismaClient,
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

	const mastra = new Mastra({
		workflows: {
			ownedChannelBackfill,
			ownedChannelDailySync,
			trackedDailyPoll,
		},
	});

	return mastra;
}
