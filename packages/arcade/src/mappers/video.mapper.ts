import type { Prisma } from "@agentic-youtube-admin/db";
import type { OwnedVideoItem } from "../schemas/discover-videos";
import type { PublicDiscoverVideoItem } from "../schemas/public-channel";

export function mapOwnedVideoToDb(
	video: OwnedVideoItem,
	channelId: string,
): Prisma.VideoUncheckedCreateInput {
	return {
		channelId,
		videoId: video.videoId,
		title: video.title,
		description: video.description ?? null,
		thumbnailUrl: video.thumbnailUrl ?? null,
		publishedAt: new Date(video.publishedAt),
		duration: video.duration ?? null,
		tags: video.tags ?? [],
		categoryId: video.categoryId ?? null,
		liveBroadcastContent: video.liveBroadcastContent ?? null,
		contentType: video.contentType ?? null,
		width: video.width ?? null,
		height: video.height ?? null,
		aspectRatio: video.aspectRatio ?? null,
		currentViews: BigInt(video.currentViews),
		currentLikes: video.currentLikes,
		currentComments: video.currentComments,
	};
}

export function mapPublicVideoToTrackedDb(
	video: PublicDiscoverVideoItem,
	channelId: string,
): Prisma.TrackedVideoUncheckedCreateInput {
	return {
		channelId,
		videoId: video.videoId,
		title: video.title,
		description: video.description ?? null,
		thumbnailUrl: video.thumbnailUrl ?? null,
		publishedAt: new Date(video.publishedAt),
		duration: video.duration ?? null,
		tags: video.tags ?? [],
		categoryId: video.categoryId ?? null,
		liveBroadcastContent: video.liveBroadcastContent ?? null,
		contentType: video.contentType ?? null,
	};
}
