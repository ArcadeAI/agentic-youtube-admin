import { Elysia, t } from "elysia";
import type { ScannerService } from "./scanner.service";

export function createScannerRoutes(service: ScannerService) {
	return new Elysia({ prefix: "/api/scanner" })
		.post(
			"/backfill",
			async ({ body }) => {
				const arcadeUserId = await service.resolveArcadeUserId(body.userId);
				return service.runOwnedBackfill(
					body.userId,
					arcadeUserId,
					body.channelId,
					{
						startDate: body.startDate,
						endDate: body.endDate,
					},
				);
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
				return service.runOwnedDailySync(
					body.userId,
					arcadeUserId,
					body.channelId,
				);
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
				return service.runTrackedDailyPoll(body.userId, arcadeUserId);
			},
			{
				body: t.Object({
					userId: t.String(),
				}),
			},
		);
}
