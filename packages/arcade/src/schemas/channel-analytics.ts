import { z } from "zod";

export const getMyChannelResponseSchema = z.object({
	channelId: z.string(),
	title: z.string(),
	description: z.string().nullable().optional(),
	thumbnail: z.string().nullable().optional(),
	customUrl: z.string().nullable().optional(),
	subscriberCount: z.number().default(0),
	viewCount: z.number().default(0),
	videoCount: z.number().default(0),
});

export type GetMyChannelResponse = z.infer<typeof getMyChannelResponseSchema>;

const channelAnalyticsDaySchema = z.object({
	date: z.string(),
	subscribersGained: z.number().nullable().optional(),
	subscribersLost: z.number().nullable().optional(),
	subscriberCount: z.number().nullable().optional(),
	views: z.number().default(0),
	estimatedMinutesWatched: z.number().nullable().optional(),
	averageViewDuration: z.number().nullable().optional(),
});

export type ChannelAnalyticsDay = z.infer<typeof channelAnalyticsDaySchema>;

export const getChannelAnalyticsResponseSchema = z.array(
	channelAnalyticsDaySchema,
);

export type GetChannelAnalyticsResponse = z.infer<
	typeof getChannelAnalyticsResponseSchema
>;
