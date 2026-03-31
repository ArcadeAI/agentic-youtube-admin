import { z } from "zod";

// score_channel uses snake_case
export const scoreChannelResponseSchema = z.object({
	channel: z.string(),
	subscriber_count: z.number(),
	videos_analyzed: z.number(),
	engagement_score: z.number(),
	average_views: z.number(),
	average_likes: z.number(),
	average_comments: z.number(),
});

export type ScoreChannelResponse = z.infer<typeof scoreChannelResponseSchema>;
