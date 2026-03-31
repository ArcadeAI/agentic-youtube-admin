import type { Prisma } from "@agentic-youtube-admin/db";
import type { DeviceStatsRow } from "../schemas/device-stats";

export function mapDeviceStatsToDb(
	row: DeviceStatsRow,
	videoId: string,
): Prisma.VideoDeviceStatsUncheckedCreateInput {
	return {
		videoId,
		date: new Date(row.date),
		deviceType: row.deviceType,
		operatingSystem: "",
		views: BigInt(row.views),
		estimatedMinutesWatched:
			row.estimatedMinutesWatched != null
				? BigInt(row.estimatedMinutesWatched)
				: null,
		averageViewDuration: row.averageViewDuration ?? null,
	};
}
