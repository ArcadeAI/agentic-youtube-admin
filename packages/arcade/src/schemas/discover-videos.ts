import { z } from "zod";

const ownedVideoItemSchema = z.object({
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
	width: z.number().nullable().optional(),
	height: z.number().nullable().optional(),
	aspectRatio: z.number().nullable().optional(),
	currentViews: z.number().default(0),
	currentLikes: z.number().default(0),
	currentComments: z.number().default(0),
});

export type OwnedVideoItem = z.infer<typeof ownedVideoItemSchema>;

export const listChannelVideosResponseSchema = z.object({
	videos: z.array(ownedVideoItemSchema),
	nextPageToken: z.string().nullable().optional(),
});

export type ListChannelVideosResponse = z.infer<
	typeof listChannelVideosResponseSchema
>;

export const discoverAllVideosResponseSchema = z.object({
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
	videos: z.array(ownedVideoItemSchema),
});

export type DiscoverAllVideosResponse = z.infer<
	typeof discoverAllVideosResponseSchema
>;
