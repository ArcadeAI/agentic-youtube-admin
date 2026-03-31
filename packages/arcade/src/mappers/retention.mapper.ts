import type { Prisma } from "@agentic-youtube-admin/db";
import type { RetentionPoint } from "../schemas/retention";

export function mapRetentionToDb(
	point: RetentionPoint,
	videoId: string,
	calculatedAt: Date,
): Prisma.VideoRetentionUncheckedCreateInput {
	return {
		videoId,
		elapsedRatio: point.elapsedRatio,
		audienceWatchRatio: point.audienceWatchRatio,
		relativeRetentionPerformance: point.relativeRetentionPerformance ?? null,
		calculatedAt,
	};
}
