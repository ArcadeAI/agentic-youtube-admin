import { Elysia, t } from "elysia";
import type { SchedulerService } from "./scheduler.service";
import { scanTypes } from "./scheduler.types";

export function createSchedulerRoutes(service: SchedulerService) {
	return new Elysia({ prefix: "/api/scheduler" })
		.get(
			"/schedules",
			async ({ query }) => {
				return service.listSchedules(query.userId);
			},
			{
				query: t.Object({
					userId: t.String(),
				}),
			},
		)
		.get(
			"/schedules/:id",
			async ({ params, query }) => {
				const schedule = await service.getSchedule(params.id, query.userId);
				if (!schedule) return new Response("Not found", { status: 404 });
				return schedule;
			},
			{
				params: t.Object({ id: t.String() }),
				query: t.Object({ userId: t.String() }),
			},
		)
		.post(
			"/schedules",
			async ({ body }) => {
				return service.createSchedule(body.userId, {
					scanType: body.scanType,
					channelId: body.channelId,
					cronExpression: body.cronExpression,
					config: body.config,
					notificationConfigId: body.notificationConfigId,
				});
			},
			{
				body: t.Object({
					userId: t.String(),
					scanType: t.Union(scanTypes.map((s) => t.Literal(s))),
					channelId: t.Optional(t.String()),
					cronExpression: t.String(),
					config: t.Optional(t.Record(t.String(), t.Unknown())),
					notificationConfigId: t.Optional(t.String()),
				}),
			},
		)
		.patch(
			"/schedules/:id",
			async ({ params, body }) => {
				const updated = await service.updateSchedule(params.id, body.userId, {
					cronExpression: body.cronExpression,
					isActive: body.isActive,
					config: body.config,
					notificationConfigId: body.notificationConfigId,
				});
				if (!updated) return new Response("Not found", { status: 404 });
				return updated;
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({
					userId: t.String(),
					cronExpression: t.Optional(t.String()),
					isActive: t.Optional(t.Boolean()),
					config: t.Optional(t.Record(t.String(), t.Unknown())),
					notificationConfigId: t.Optional(t.Nullable(t.String())),
				}),
			},
		)
		.delete(
			"/schedules/:id",
			async ({ params, query }) => {
				const deleted = await service.deleteSchedule(params.id, query.userId);
				if (!deleted) return new Response("Not found", { status: 404 });
				return { success: true };
			},
			{
				params: t.Object({ id: t.String() }),
				query: t.Object({ userId: t.String() }),
			},
		)
		.get(
			"/schedules/:id/runs",
			async ({ params, query }) => {
				return service.listScanRuns(
					params.id,
					query.limit ? Number(query.limit) : 20,
				);
			},
			{
				params: t.Object({ id: t.String() }),
				query: t.Object({
					limit: t.Optional(t.String()),
				}),
			},
		);
}
