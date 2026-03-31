import { z } from "zod";

const liveStreamPointSchema = z.object({
	livestreamPosition: z.number(),
	averageConcurrentViewers: z.number().nullable().optional(),
	peakConcurrentViewers: z.number().nullable().optional(),
});

export type LiveStreamPoint = z.infer<typeof liveStreamPointSchema>;

export const getLiveStreamTimelineResponseSchema = z.array(
	liveStreamPointSchema,
);

export type GetLiveStreamTimelineResponse = z.infer<
	typeof getLiveStreamTimelineResponseSchema
>;
