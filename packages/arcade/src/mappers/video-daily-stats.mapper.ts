import type { Prisma } from "@agentic-youtube-admin/db";
import type { VideoDailyStats } from "../schemas/video-analytics";

export function mapVideoDailyStatsToDb(
	row: VideoDailyStats,
	videoId: string,
): Prisma.VideoDailyStatsUncheckedCreateInput {
	return {
		videoId,
		date: new Date(row.date),
		views: BigInt(row.views),
		estimatedMinutesWatched:
			row.estimatedMinutesWatched != null
				? BigInt(row.estimatedMinutesWatched)
				: null,
		averageViewDuration: row.averageViewDuration ?? null,
		averageViewPercentage: row.averageViewPercentage ?? null,
		likes: row.likes ?? null,
		comments: row.comments ?? null,
		shares: row.shares ?? null,
		videosAddedToPlaylists: row.videosAddedToPlaylists ?? null,
		videosRemovedFromPlaylists: row.videosRemovedFromPlaylists ?? null,
		subscribersGained: row.subscribersGained ?? null,
		subscribersLost: row.subscribersLost ?? null,
		engagedViews: row.engagedViews != null ? BigInt(row.engagedViews) : null,
		redViews: row.redViews != null ? BigInt(row.redViews) : null,
		estimatedRedMinutesWatched:
			row.estimatedRedMinutesWatched != null
				? BigInt(row.estimatedRedMinutesWatched)
				: null,
		cardImpressions:
			row.cardImpressions != null ? BigInt(row.cardImpressions) : null,
		cardClicks: row.cardClicks != null ? BigInt(row.cardClicks) : null,
		cardClickRate: row.cardClickRate ?? null,
		cardTeaserImpressions:
			row.cardTeaserImpressions != null
				? BigInt(row.cardTeaserImpressions)
				: null,
		cardTeaserClicks:
			row.cardTeaserClicks != null ? BigInt(row.cardTeaserClicks) : null,
		cardTeaserClickRate: row.cardTeaserClickRate ?? null,
		averageConcurrentViewers: row.averageConcurrentViewers ?? null,
		peakConcurrentViewers: row.peakConcurrentViewers ?? null,
	};
}
