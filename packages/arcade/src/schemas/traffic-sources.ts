import { z } from "zod";

const trafficSourceRowSchema = z.object({
	date: z.string(),
	trafficSourceType: z.string(),
	views: z.number().default(0),
	estimatedMinutesWatched: z.number().nullable().optional(),
});

export type TrafficSourceRow = z.infer<typeof trafficSourceRowSchema>;

export const getBatchVideoTrafficSourcesResponseSchema = z.record(
	z.string(),
	z.array(trafficSourceRowSchema),
);

export type GetBatchVideoTrafficSourcesResponse = z.infer<
	typeof getBatchVideoTrafficSourcesResponseSchema
>;

const backfillMetadataSchema = z.object({
	videosRequested: z.number(),
	videosWithData: z.number(),
	errors: z.unknown().nullable().optional(),
});

export const backfillVideoTrafficSourcesResponseSchema = z.object({
	data: z.record(z.string(), z.array(trafficSourceRowSchema)),
	metadata: backfillMetadataSchema,
});

export type BackfillVideoTrafficSourcesResponse = z.infer<
	typeof backfillVideoTrafficSourcesResponseSchema
>;
