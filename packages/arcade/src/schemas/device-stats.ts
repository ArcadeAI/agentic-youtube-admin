import { z } from "zod";

const deviceStatsRowSchema = z.object({
	date: z.string(),
	deviceType: z.string(),
	views: z.number().default(0),
	estimatedMinutesWatched: z.number().nullable().optional(),
	averageViewDuration: z.number().nullable().optional(),
});

export type DeviceStatsRow = z.infer<typeof deviceStatsRowSchema>;

export const getBatchVideoDeviceStatsResponseSchema = z.record(
	z.string(),
	z.array(deviceStatsRowSchema),
);

export type GetBatchVideoDeviceStatsResponse = z.infer<
	typeof getBatchVideoDeviceStatsResponseSchema
>;

const backfillMetadataSchema = z.object({
	videosRequested: z.number(),
	videosWithData: z.number(),
	errors: z.unknown().nullable().optional(),
});

export const backfillVideoDeviceStatsResponseSchema = z.object({
	data: z.record(z.string(), z.array(deviceStatsRowSchema)),
	metadata: backfillMetadataSchema,
});

export type BackfillVideoDeviceStatsResponse = z.infer<
	typeof backfillVideoDeviceStatsResponseSchema
>;
