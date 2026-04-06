import { Elysia, t } from "elysia";
import type { ScannerService } from "./scanner.service";

export function createScannerRoutes(service: ScannerService) {
	return new Elysia({ prefix: "/api/scanner" })
		.post(
			"/backfill",
			async ({ body }) => {
				const arcadeUserId = await service.resolveArcadeUserId(body.userId);
				try {
					const result = await service.runOwnedBackfill(
						body.userId,
						arcadeUserId,
						body.channelId,
						{ startDate: body.startDate, endDate: body.endDate },
					);
					await service.notifyScanComplete(
						body.userId,
						"owned_backfill",
						body.channelId,
						result,
					);
					return result;
				} catch (err) {
					await service.notifyScanComplete(
						body.userId,
						"owned_backfill",
						body.channelId,
						undefined,
						err instanceof Error ? err.message : String(err),
					);
					throw err;
				}
			},
			{
				body: t.Object({
					userId: t.String(),
					channelId: t.String(),
					startDate: t.String(),
					endDate: t.String(),
				}),
			},
		)
		.post(
			"/daily-sync",
			async ({ body }) => {
				const arcadeUserId = await service.resolveArcadeUserId(body.userId);
				try {
					const result = await service.runOwnedDailySync(
						body.userId,
						arcadeUserId,
						body.channelId,
					);
					await service.notifyScanComplete(
						body.userId,
						"owned_daily_sync",
						body.channelId,
						result,
					);
					return result;
				} catch (err) {
					await service.notifyScanComplete(
						body.userId,
						"owned_daily_sync",
						body.channelId,
						undefined,
						err instanceof Error ? err.message : String(err),
					);
					throw err;
				}
			},
			{
				body: t.Object({
					userId: t.String(),
					channelId: t.String(),
				}),
			},
		)
		.post(
			"/daily-poll",
			async ({ body }) => {
				const arcadeUserId = await service.resolveArcadeUserId(body.userId);
				try {
					const result = await service.runTrackedDailyPoll(
						body.userId,
						arcadeUserId,
					);
					await service.notifyScanComplete(
						body.userId,
						"tracked_daily_poll",
						null,
						result,
					);
					return result;
				} catch (err) {
					await service.notifyScanComplete(
						body.userId,
						"tracked_daily_poll",
						null,
						undefined,
						err instanceof Error ? err.message : String(err),
					);
					throw err;
				}
			},
			{
				body: t.Object({
					userId: t.String(),
				}),
			},
		);
}
