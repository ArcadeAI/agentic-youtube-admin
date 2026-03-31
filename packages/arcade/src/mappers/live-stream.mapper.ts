import type { Prisma } from "@agentic-youtube-admin/db";
import type { LiveStreamPoint } from "../schemas/live-stream";

export function mapLiveStreamPointToDb(
	point: LiveStreamPoint,
	videoId: string,
): Prisma.LiveStreamTimelineUncheckedCreateInput {
	return {
		videoId,
		livestreamPosition: point.livestreamPosition,
		averageConcurrentViewers: point.averageConcurrentViewers ?? null,
		peakConcurrentViewers: point.peakConcurrentViewers ?? null,
	};
}
