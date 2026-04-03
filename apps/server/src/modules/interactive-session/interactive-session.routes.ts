import prisma from "@agentic-youtube-admin/db";
import { Elysia, t } from "elysia";
import { authenticateInteractive } from "../../middleware/interactive-auth";
import { NotificationService } from "../notification/notification.service";
import { SchedulerService } from "../scheduler/scheduler.service";
import {
	decodePageToken,
	paginateResults,
} from "./interactive-session.pagination";

const notificationService = new NotificationService(prisma);
const schedulerService = new SchedulerService(prisma);

const DEFAULT_PAGE_SIZE = 20;

export const interactiveSessionRoutes = new Elysia({
	prefix: "/api/v1/interactive",
})
	// Notifications
	.get(
		"/notifications",
		async ({ request, query }) => {
			// ── DEBUG: raw request inspection ──
			const hdrs: Record<string, string> = {};
			request.headers.forEach((v, k) => {
				hdrs[k] =
					k.toLowerCase() === "authorization"
						? `${v.slice(0, 20)}…(len=${v.length})`
						: v;
			});
			console.log("[interactive] GET /notifications");
			console.log(
				"[interactive]   method=%s url=%s",
				request.method,
				request.url,
			);
			console.log("[interactive]   headers=%s", JSON.stringify(hdrs, null, 2));

			const authHeader = request.headers.get("authorization");
			console.log(
				"[interactive]   authorization present=%s length=%d bearer_prefix=%s",
				!!authHeader,
				authHeader?.length ?? 0,
				authHeader?.startsWith("Bearer ") ?? false,
			);
			const rawToken = authHeader?.replace("Bearer ", "") ?? "";
			console.log(
				"[interactive]   token length=%d first20=%s",
				rawToken.length,
				rawToken.slice(0, 20),
			);
			// ── END DEBUG ──

			let auth: { userId: string };
			try {
				auth = await authenticateInteractive(request);
			} catch (err) {
				const errStr =
					err instanceof Error ? (err.stack ?? err.message) : String(err);
				console.error("[interactive]   auth FAILED:", errStr);
				return new Response(JSON.stringify({ error: errStr }), {
					status: 401,
					headers: { "Content-Type": "application/json" },
				});
			}
			console.log("[interactive]   auth OK userId=%s", auth.userId);
			const items = await notificationService.list(auth.userId);
			console.log("[interactive]   fetched %d notifications", items.length);
			const cursor = query.page_token
				? decodePageToken(query.page_token)
				: null;
			const limit = cursor?.limit ?? DEFAULT_PAGE_SIZE;
			const result = paginateResults(items, limit);
			console.log(
				"[interactive]   response: %s",
				JSON.stringify(result).slice(0, 500),
			);
			return result;
		},
		{
			query: t.Object({
				page_token: t.Optional(t.String()),
			}),
		},
	)
	.post(
		"/notifications",
		async ({ request, body }) => {
			const auth = await authenticateInteractive(request);
			return notificationService.create(auth.userId, {
				name: body.name,
				notificationType: body.notification_type as "new_video",
				deliveryMethod: body.delivery_method as "email",
				channelId: body.channel_id,
				conditions: body.conditions,
				deliveryConfig: body.delivery_config,
			});
		},
		{
			body: t.Object({
				name: t.String(),
				notification_type: t.String(),
				delivery_method: t.String(),
				channel_id: t.Optional(t.String()),
				conditions: t.Optional(t.Record(t.String(), t.Unknown())),
				delivery_config: t.Optional(t.Record(t.String(), t.Unknown())),
			}),
		},
	)
	.delete(
		"/notifications/:id",
		async ({ request, params }) => {
			const auth = await authenticateInteractive(request);
			const deleted = await notificationService.delete(params.id, auth.userId);
			if (!deleted) return new Response("Not found", { status: 404 });
			return { success: true };
		},
		{
			params: t.Object({ id: t.String() }),
		},
	)
	// Schedules
	.get(
		"/schedules",
		async ({ request, query }) => {
			const auth = await authenticateInteractive(request);
			const items = await schedulerService.listSchedules(auth.userId);
			const cursor = query.page_token
				? decodePageToken(query.page_token)
				: null;
			const limit = cursor?.limit ?? DEFAULT_PAGE_SIZE;
			return paginateResults(items, limit);
		},
		{
			query: t.Object({
				page_token: t.Optional(t.String()),
			}),
		},
	)
	.post(
		"/schedules",
		async ({ request, body }) => {
			const auth = await authenticateInteractive(request);
			return schedulerService.createSchedule(auth.userId, {
				scanType: body.scan_type as "owned_daily_sync",
				cronExpression: body.cron_expression,
				channelId: body.channel_id,
				config: body.config,
			});
		},
		{
			body: t.Object({
				scan_type: t.String(),
				cron_expression: t.String(),
				channel_id: t.Optional(t.String()),
				config: t.Optional(t.Record(t.String(), t.Unknown())),
			}),
		},
	)
	.delete(
		"/schedules/:id",
		async ({ request, params }) => {
			const auth = await authenticateInteractive(request);
			const deleted = await schedulerService.deleteSchedule(
				params.id,
				auth.userId,
			);
			if (!deleted) return new Response("Not found", { status: 404 });
			return { success: true };
		},
		{
			params: t.Object({ id: t.String() }),
		},
	)
	// Reporting
	.get(
		"/channels/:channelId/analytics",
		async ({ params, query }) => {
			const stats = await prisma.channelDailyStats.findMany({
				where: {
					channelId: params.channelId,
					...(query.start_date && query.end_date
						? {
								date: {
									gte: new Date(query.start_date),
									lte: new Date(query.end_date),
								},
							}
						: {}),
				},
				orderBy: { date: "desc" },
				take: DEFAULT_PAGE_SIZE,
			});

			return { items: stats };
		},
		{
			params: t.Object({ channelId: t.String() }),
			query: t.Object({
				start_date: t.Optional(t.String()),
				end_date: t.Optional(t.String()),
				page_token: t.Optional(t.String()),
			}),
		},
	)
	.get(
		"/videos/:videoId/summary",
		async ({ params }) => {
			const video = await prisma.video.findFirst({
				where: { videoId: params.videoId },
			});
			if (!video) return new Response("Not found", { status: 404 });

			return {
				videoId: params.videoId,
				title: video.title,
				summary: "Summary generation not yet implemented",
			};
		},
		{
			params: t.Object({ videoId: t.String() }),
		},
	);
