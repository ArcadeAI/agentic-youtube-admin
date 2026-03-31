import { z } from "zod";

const geographyStatsRowSchema = z.object({
	date: z.string(),
	country: z.string(),
	views: z.number().default(0),
	estimatedMinutesWatched: z.number().nullable().optional(),
	subscribersGained: z.number().nullable().optional(),
});

export type GeographyStatsRow = z.infer<typeof geographyStatsRowSchema>;

export const getBatchVideoGeographyStatsResponseSchema = z.record(
	z.string(),
	z.array(geographyStatsRowSchema),
);

export type GetBatchVideoGeographyStatsResponse = z.infer<
	typeof getBatchVideoGeographyStatsResponseSchema
>;

const backfillMetadataSchema = z.object({
	videosRequested: z.number(),
	videosWithData: z.number(),
	errors: z.unknown().nullable().optional(),
});

export const backfillVideoGeographyStatsResponseSchema = z.object({
	data: z.record(z.string(), z.array(geographyStatsRowSchema)),
	metadata: backfillMetadataSchema,
});

export type BackfillVideoGeographyStatsResponse = z.infer<
	typeof backfillVideoGeographyStatsResponseSchema
>;
