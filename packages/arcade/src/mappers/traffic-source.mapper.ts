import type { Prisma } from "@agentic-youtube-admin/db";
import type { TrafficSourceRow } from "../schemas/traffic-sources";

export function mapTrafficSourceToDb(
	row: TrafficSourceRow,
	videoId: string,
): Prisma.VideoTrafficSourceStatsUncheckedCreateInput {
	return {
		videoId,
		date: new Date(row.date),
		trafficSourceType: row.trafficSourceType,
		trafficSourceDetail: "",
		views: BigInt(row.views),
		estimatedMinutesWatched:
			row.estimatedMinutesWatched != null
				? BigInt(row.estimatedMinutesWatched)
				: null,
	};
}
