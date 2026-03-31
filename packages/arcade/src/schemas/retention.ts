import { z } from "zod";

const retentionPointSchema = z.object({
	elapsedRatio: z.number(),
	audienceWatchRatio: z.number(),
	relativeRetentionPerformance: z.number().nullable().optional(),
});

export type RetentionPoint = z.infer<typeof retentionPointSchema>;

export const getVideoRetentionCurveResponseSchema =
	z.array(retentionPointSchema);

export type GetVideoRetentionCurveResponse = z.infer<
	typeof getVideoRetentionCurveResponseSchema
>;
