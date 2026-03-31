import type { Prisma } from "@agentic-youtube-admin/db";
import type { GetPublicChannelInfoResponse } from "../schemas/public-channel";

export function mapPublicChannelInfoToDb(
	info: GetPublicChannelInfoResponse,
	userId: string,
): Prisma.TrackedChannelUncheckedCreateInput {
	return {
		userId,
		channelId: info.channelId,
		channelTitle: info.title,
		channelThumbnail: info.thumbnail ?? null,
		customUrl: info.customUrl ?? null,
		description: info.description ?? null,
		country: info.country ?? null,
	};
}

export function mapPublicChannelToSnapshot(
	info: GetPublicChannelInfoResponse,
	channelId: string,
	date: Date,
): Prisma.TrackedChannelSnapshotUncheckedCreateInput {
	return {
		channelId,
		date,
		subscriberCount: info.subscriberCount ?? null,
		totalViews: BigInt(info.viewCount),
		videoCount: info.videoCount,
		subscriberCountHidden: info.subscriberCountHidden,
	};
}
