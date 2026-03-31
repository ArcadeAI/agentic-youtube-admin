import { Elysia, t } from "elysia";
import type { NotificationService } from "./notification.service";
import { deliveryMethods, notificationTypes } from "./notification.types";

export function createNotificationRoutes(service: NotificationService) {
	return new Elysia({ prefix: "/api/notifications" })
		.get(
			"/",
			async ({ query }) => {
				return service.list(query.userId);
			},
			{
				query: t.Object({ userId: t.String() }),
			},
		)
		.get(
			"/:id",
			async ({ params, query }) => {
				const config = await service.get(params.id, query.userId);
				if (!config) return new Response("Not found", { status: 404 });
				return config;
			},
			{
				params: t.Object({ id: t.String() }),
				query: t.Object({ userId: t.String() }),
			},
		)
		.post(
			"/",
			async ({ body }) => {
				return service.create(body.userId, {
					name: body.name,
					channelId: body.channelId,
					notificationType: body.notificationType,
					conditions: body.conditions,
					deliveryMethod: body.deliveryMethod,
					deliveryConfig: body.deliveryConfig,
				});
			},
			{
				body: t.Object({
					userId: t.String(),
					name: t.String(),
					channelId: t.Optional(t.String()),
					notificationType: t.Union(notificationTypes.map((n) => t.Literal(n))),
					conditions: t.Optional(t.Record(t.String(), t.Unknown())),
					deliveryMethod: t.Union(deliveryMethods.map((d) => t.Literal(d))),
					deliveryConfig: t.Optional(t.Record(t.String(), t.Unknown())),
				}),
			},
		)
		.patch(
			"/:id",
			async ({ params, body }) => {
				const updated = await service.update(params.id, body.userId, {
					name: body.name,
					channelId: body.channelId,
					notificationType: body.notificationType,
					conditions: body.conditions,
					deliveryMethod: body.deliveryMethod,
					deliveryConfig: body.deliveryConfig,
					isActive: body.isActive,
				});
				if (!updated) return new Response("Not found", { status: 404 });
				return updated;
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({
					userId: t.String(),
					name: t.Optional(t.String()),
					channelId: t.Optional(t.String()),
					notificationType: t.Optional(
						t.Union(notificationTypes.map((n) => t.Literal(n))),
					),
					conditions: t.Optional(t.Record(t.String(), t.Unknown())),
					deliveryMethod: t.Optional(
						t.Union(deliveryMethods.map((d) => t.Literal(d))),
					),
					deliveryConfig: t.Optional(t.Record(t.String(), t.Unknown())),
					isActive: t.Optional(t.Boolean()),
				}),
			},
		)
		.delete(
			"/:id",
			async ({ params, query }) => {
				const deleted = await service.delete(params.id, query.userId);
				if (!deleted) return new Response("Not found", { status: 404 });
				return { success: true };
			},
			{
				params: t.Object({ id: t.String() }),
				query: t.Object({ userId: t.String() }),
			},
		);
}
