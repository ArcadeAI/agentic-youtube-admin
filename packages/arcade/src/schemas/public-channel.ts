import { z } from "zod";

// list_public_channel_videos uses snake_case
const publicVideoItemSchema = z.object({
	video_id: z.string(),
	title: z.string(),
	description: z.string().nullable().optional(),
	published_at: z.string(),
	thumbnail: z.string().nullable().optional(),
	url: z.string().nullable().optional(),
	views: z.number().default(0),
	likes: z.number().default(0),
	comments: z.number().default(0),
});

export type PublicVideoItem = z.infer<typeof publicVideoItemSchema>;

export const listPublicChannelVideosResponseSchema = z.object({
	videos: z.array(publicVideoItemSchema),
	next_page_token: z.string().nullable().optional(),
});

export type ListPublicChannelVideosResponse = z.infer<
	typeof listPublicChannelVideosResponseSchema
>;

// get_public_channel_info (not yet implemented, define for future)
export const getPublicChannelInfoResponseSchema = z.object({
	channelId: z.string(),
	title: z.string(),
	description: z.string().nullable().optional(),
	thumbnail: z.string().nullable().optional(),
	customUrl: z.string().nullable().optional(),
	country: z.string().nullable().optional(),
	subscriberCount: z.number().nullable().optional(),
	subscriberCountHidden: z.boolean().default(false),
	viewCount: z.number().default(0),
	videoCount: z.number().default(0),
	publishedAt: z.string().nullable().optional(),
});

export type GetPublicChannelInfoResponse = z.infer<
	typeof getPublicChannelInfoResponseSchema
>;

// discover_all_public_videos (not yet implemented)
const publicDiscoverVideoItemSchema = z.object({
	videoId: z.string(),
	title: z.string(),
	description: z.string().nullable().optional(),
	publishedAt: z.string(),
	thumbnailUrl: z.string().nullable().optional(),
	duration: z.number().nullable().optional(),
	tags: z.array(z.string()).optional().default([]),
	categoryId: z.string().nullable().optional(),
	liveBroadcastContent: z.string().nullable().optional(),
	contentType: z.string().nullable().optional(),
	currentViews: z.number().default(0),
	currentLikes: z.number().default(0),
	currentComments: z.number().default(0),
});

export type PublicDiscoverVideoItem = z.infer<
	typeof publicDiscoverVideoItemSchema
>;

export const discoverAllPublicVideosResponseSchema = z.object({
	channelId: z.string(),
	totalVideosReported: z.number(),
	totalVideosDiscovered: z.number(),
	contentTypeCounts: z
		.object({
			SHORTS: z.number().optional().default(0),
			NORMAL: z.number().optional().default(0),
			LIVE: z.number().optional().default(0),
		})
		.optional(),
	videos: z.array(publicDiscoverVideoItemSchema),
});

export type DiscoverAllPublicVideosResponse = z.infer<
	typeof discoverAllPublicVideosResponseSchema
>;

// get_public_video_stats (not yet implemented)
const publicVideoStatsSchema = z.object({
	videoId: z.string(),
	viewCount: z.number().default(0),
	likeCount: z.number().default(0),
	commentCount: z.number().default(0),
});

export type PublicVideoStats = z.infer<typeof publicVideoStatsSchema>;

export const getPublicVideoStatsResponseSchema = z.record(
	z.string(),
	publicVideoStatsSchema,
);

export type GetPublicVideoStatsResponse = z.infer<
	typeof getPublicVideoStatsResponseSchema
>;

// search_channels (not yet implemented)
const searchChannelItemSchema = z.object({
	channelId: z.string(),
	title: z.string(),
	description: z.string().nullable().optional(),
	thumbnail: z.string().nullable().optional(),
});

export type SearchChannelItem = z.infer<typeof searchChannelItemSchema>;

export const searchChannelsResponseSchema = z.array(searchChannelItemSchema);

export type SearchChannelsResponse = z.infer<
	typeof searchChannelsResponseSchema
>;

// get_public_video_transcription (not yet implemented)
const transcriptionItemSchema = z.object({
	videoId: z.string(),
	transcription: z.string(),
});

export type TranscriptionItem = z.infer<typeof transcriptionItemSchema>;

export const getPublicVideoTranscriptionResponseSchema = z.record(
	z.string(),
	transcriptionItemSchema,
);

export type GetPublicVideoTranscriptionResponse = z.infer<
	typeof getPublicVideoTranscriptionResponseSchema
>;
