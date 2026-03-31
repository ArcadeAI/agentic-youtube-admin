import type { Prisma } from "@agentic-youtube-admin/db";
import type { GeographyStatsRow } from "../schemas/geography-stats";

export function mapGeographyStatsToDb(
	row: GeographyStatsRow,
	videoId: string,
): Prisma.VideoGeographyStatsUncheckedCreateInput {
	return {
		videoId,
		date: new Date(row.date),
		country: row.country,
		views: BigInt(row.views),
		estimatedMinutesWatched:
			row.estimatedMinutesWatched != null
				? BigInt(row.estimatedMinutesWatched)
				: null,
		subscribersGained: row.subscribersGained ?? null,
	};
}
