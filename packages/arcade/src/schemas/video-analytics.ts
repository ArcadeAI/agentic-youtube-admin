import { z } from "zod";

const videoDailyStatsSchema = z.object({
	date: z.string(),
	views: z.number().default(0),
	estimatedMinutesWatched: z.number().nullable().optional(),
	averageViewDuration: z.number().nullable().optional(),
	averageViewPercentage: z.number().nullable().optional(),
	likes: z.number().nullable().optional(),
	comments: z.number().nullable().optional(),
	shares: z.number().nullable().optional(),
	videosAddedToPlaylists: z.number().nullable().optional(),
	videosRemovedFromPlaylists: z.number().nullable().optional(),
	subscribersGained: z.number().nullable().optional(),
	subscribersLost: z.number().nullable().optional(),
	engagedViews: z.number().nullable().optional(),
	redViews: z.number().nullable().optional(),
	estimatedRedMinutesWatched: z.number().nullable().optional(),
	cardImpressions: z.number().nullable().optional(),
	cardClicks: z.number().nullable().optional(),
	cardClickRate: z.number().nullable().optional(),
	cardTeaserImpressions: z.number().nullable().optional(),
	cardTeaserClicks: z.number().nullable().optional(),
	cardTeaserClickRate: z.number().nullable().optional(),
	averageConcurrentViewers: z.number().nullable().optional(),
	peakConcurrentViewers: z.number().nullable().optional(),
});

export type VideoDailyStats = z.infer<typeof videoDailyStatsSchema>;

export const getVideoAnalyticsResponseSchema = z.array(videoDailyStatsSchema);

export type GetVideoAnalyticsResponse = z.infer<
	typeof getVideoAnalyticsResponseSchema
>;

export const getBatchVideoAnalyticsResponseSchema = z.record(
	z.string(),
	z.array(videoDailyStatsSchema),
);

export type GetBatchVideoAnalyticsResponse = z.infer<
	typeof getBatchVideoAnalyticsResponseSchema
>;

const backfillMetadataSchema = z.object({
	videosRequested: z.number(),
	videosWithData: z.number(),
	dateRange: z
		.object({
			start: z.string(),
			end: z.string(),
		})
		.optional(),
	dateChunks: z.number().optional(),
	videoBatches: z.number().optional(),
	errors: z.unknown().nullable().optional(),
});

export const backfillVideoAnalyticsResponseSchema = z.object({
	data: z.record(z.string(), z.array(videoDailyStatsSchema)),
	metadata: backfillMetadataSchema,
});

export type BackfillVideoAnalyticsResponse = z.infer<
	typeof backfillVideoAnalyticsResponseSchema
>;
