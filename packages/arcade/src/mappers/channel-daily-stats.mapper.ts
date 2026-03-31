import type { Prisma } from "@agentic-youtube-admin/db";
import type { ChannelAnalyticsDay } from "../schemas/channel-analytics";

export function mapChannelDailyStatsToDb(
	row: ChannelAnalyticsDay,
	channelId: string,
	totalViews: bigint,
	totalVideos: number,
): Prisma.ChannelDailyStatsUncheckedCreateInput {
	return {
		channelId,
		date: new Date(row.date),
		subscriberCount: row.subscriberCount ?? null,
		totalViews,
		totalVideos,
		subscribersGained: row.subscribersGained ?? null,
		subscribersLost: row.subscribersLost ?? null,
		viewsGained: row.views != null ? BigInt(row.views) : null,
		estimatedMinutesWatched:
			row.estimatedMinutesWatched != null
				? BigInt(row.estimatedMinutesWatched)
				: null,
		averageViewDuration: row.averageViewDuration ?? null,
	};
}
