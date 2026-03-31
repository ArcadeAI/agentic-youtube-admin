import type { Prisma } from "@agentic-youtube-admin/db";
import type { PublicVideoStats } from "../schemas/public-channel";

export function mapPublicVideoStatsToSnapshot(
	stats: PublicVideoStats,
	videoId: string,
	date: Date,
	previousSnapshot?: {
		viewCount: bigint;
		likeCount: number;
		commentCount: number;
	},
): Prisma.TrackedVideoSnapshotUncheckedCreateInput {
	const viewCount = BigInt(stats.viewCount);
	const likeCount = stats.likeCount;
	const commentCount = stats.commentCount;

	return {
		videoId,
		date,
		viewCount,
		likeCount,
		commentCount,
		viewsDelta: previousSnapshot
			? viewCount - previousSnapshot.viewCount
			: null,
		likesDelta: previousSnapshot
			? likeCount - previousSnapshot.likeCount
			: null,
		commentsDelta: previousSnapshot
			? commentCount - previousSnapshot.commentCount
			: null,
	};
}
