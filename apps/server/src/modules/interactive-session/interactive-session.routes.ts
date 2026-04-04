import prisma from "@agentic-youtube-admin/db";
import { Elysia, t } from "elysia";
import { authenticateInteractive } from "../../middleware/interactive-auth";
import { NotificationService } from "../notification/notification.service";
import type { ScannerService } from "../scanner/scanner.service";
import { SchedulerService } from "../scheduler/scheduler.service";
import {
	decodePageToken,
	paginateResults,
} from "./interactive-session.pagination";

const notificationService = new NotificationService(prisma);
const schedulerService = new SchedulerService(prisma);

const DEFAULT_PAGE_SIZE = 20;

/**
 * Resolve a YouTube channel ID or handle to the YouTube channel ID.
 * Accepts: "UC..." (returned as-is), "@handle", or "handle".
 */
async function resolveChannelId(
	idOrHandle: string,
	userId: string,
): Promise<string> {
	if (idOrHandle.startsWith("UC")) return idOrHandle;

	const handle = idOrHandle.startsWith("@") ? idOrHandle : `@${idOrHandle}`;

	const owned = await prisma.youTubeChannel.findFirst({
		where: {
			userId,
			customUrl: { equals: handle, mode: "insensitive" },
		},
		select: { channelId: true },
	});
	if (owned) return owned.channelId;

	const tracked = await prisma.trackedChannel.findFirst({
		where: {
			userId,
			customUrl: { equals: handle, mode: "insensitive" },
		},
		select: { channelId: true },
	});
	if (tracked) return tracked.channelId;

	throw new Error(`Channel not found for: ${idOrHandle}`);
}

export function createInteractiveSessionRoutes(scannerService: ScannerService) {
	return (
		new Elysia({
			prefix: "/api/v1/interactive",
		})
			// ── Overview & Config ────────────────────────────────────────────────
			.get("/overview", async ({ request }) => {
				const auth = await authenticateInteractive(request);

				const [
					ownedChannels,
					trackedChannels,
					scheduleCount,
					notificationCount,
				] = await Promise.all([
					prisma.youTubeChannel.findMany({
						where: { userId: auth.userId },
						select: {
							channelId: true,
							channelTitle: true,
							customUrl: true,
							lastSyncAt: true,
							backfillCompleted: true,
						},
						orderBy: { channelTitle: "asc" },
					}),
					prisma.trackedChannel.findMany({
						where: { userId: auth.userId },
						select: {
							channelId: true,
							channelTitle: true,
							customUrl: true,
							isActive: true,
							lastPolledAt: true,
						},
						orderBy: { channelTitle: "asc" },
					}),
					prisma.scanSchedule.count({ where: { userId: auth.userId } }),
					prisma.notificationConfig.count({ where: { userId: auth.userId } }),
				]);

				return {
					ownedChannels,
					trackedChannels,
					counts: {
						schedules: scheduleCount,
						notifications: notificationCount,
					},
				};
			})
			.get("/owned", async ({ request }) => {
				const auth = await authenticateInteractive(request);

				const channels = await prisma.youTubeChannel.findMany({
					where: { userId: auth.userId },
					select: {
						channelId: true,
						channelTitle: true,
						customUrl: true,
						channelThumbnail: true,
						lastSyncAt: true,
						lastSyncStatus: true,
						backfillCompleted: true,
						backfillStartDate: true,
					},
					orderBy: { channelTitle: "asc" },
				});

				const channelIds = channels.map((c) => c.channelId);

				const [schedules, notifications] = await Promise.all([
					prisma.scanSchedule.findMany({
						where: {
							userId: auth.userId,
							channelId: { in: channelIds },
						},
						select: {
							id: true,
							scanType: true,
							cronExpression: true,
							isActive: true,
							lastRunAt: true,
							lastRunStatus: true,
							channelId: true,
						},
						orderBy: { createdAt: "desc" },
					}),
					prisma.notificationConfig.findMany({
						where: {
							userId: auth.userId,
							channelId: { in: channelIds },
						},
						select: {
							id: true,
							name: true,
							notificationType: true,
							deliveryMethod: true,
							isActive: true,
							lastTriggeredAt: true,
							channelId: true,
						},
						orderBy: { createdAt: "desc" },
					}),
				]);

				return channels.map((ch) => ({
					...ch,
					schedules: schedules.filter((s) => s.channelId === ch.channelId),
					notifications: notifications.filter(
						(n) => n.channelId === ch.channelId,
					),
				}));
			})
			.get("/tracking", async ({ request }) => {
				const auth = await authenticateInteractive(request);

				const channels = await prisma.trackedChannel.findMany({
					where: { userId: auth.userId },
					select: {
						channelId: true,
						channelTitle: true,
						customUrl: true,
						channelThumbnail: true,
						isActive: true,
						lastPolledAt: true,
						lastPollError: true,
						notes: true,
					},
					orderBy: { channelTitle: "asc" },
				});

				const channelIds = channels.map((c) => c.channelId);

				const schedules = await prisma.scanSchedule.findMany({
					where: {
						userId: auth.userId,
						channelId: { in: channelIds },
					},
					select: {
						id: true,
						scanType: true,
						cronExpression: true,
						isActive: true,
						lastRunAt: true,
						lastRunStatus: true,
						channelId: true,
					},
					orderBy: { createdAt: "desc" },
				});

				return channels.map((ch) => ({
					...ch,
					schedules: schedules.filter((s) => s.channelId === ch.channelId),
				}));
			})
			// ── Channel tracking ─────────────────────────────────────────────────
			.post(
				"/tracking/track",
				async ({ request, body }) => {
					const auth = await authenticateInteractive(request);

					const channelId = await resolveChannelId(
						body.channel_id,
						auth.userId,
					).catch(() => body.channel_id);

					const channel = await prisma.trackedChannel.upsert({
						where: {
							userId_channelId: {
								userId: auth.userId,
								channelId,
							},
						},
						update: { isActive: true, notes: body.notes ?? undefined },
						create: {
							userId: auth.userId,
							channelId,
							channelTitle: channelId,
							notes: body.notes ?? null,
							isActive: true,
						},
					});

					return {
						channelId: channel.channelId,
						channelTitle: channel.channelTitle,
						customUrl: channel.customUrl,
						isActive: channel.isActive,
					};
				},
				{
					body: t.Object({
						channel_id: t.String(),
						notes: t.Optional(t.String()),
					}),
				},
			)
			// ── Process management ───────────────────────────────────────────────
			.post(
				"/processes/backfill",
				async ({ request, body }) => {
					const auth = await authenticateInteractive(request);
					const channelId = await resolveChannelId(
						body.channel_id,
						auth.userId,
					);
					return scannerService.startBackfillAsync(auth.userId, channelId, {
						startDate: body.start_date,
						endDate: body.end_date,
					});
				},
				{
					body: t.Object({
						channel_id: t.String(),
						start_date: t.Optional(t.String()),
						end_date: t.Optional(t.String()),
					}),
				},
			)
			.get(
				"/processes/:id",
				async ({ request, params }) => {
					await authenticateInteractive(request);
					const process = await scannerService.getProcessStatus(params.id);
					if (!process) {
						return new Response(
							JSON.stringify({ error: "Process not found" }),
							{ status: 404, headers: { "Content-Type": "application/json" } },
						);
					}
					return process;
				},
				{ params: t.Object({ id: t.String() }) },
			)
			.post(
				"/processes/:id/cancel",
				async ({ request, params }) => {
					const auth = await authenticateInteractive(request);
					const result = await scannerService.cancelProcess(
						params.id,
						auth.userId,
					);
					if (!result) {
						return new Response(
							JSON.stringify({ error: "Process not found" }),
							{ status: 404, headers: { "Content-Type": "application/json" } },
						);
					}
					return { id: result.id, status: result.status };
				},
				{ params: t.Object({ id: t.String() }) },
			)
			.get("/processes", async ({ request }) => {
				const auth = await authenticateInteractive(request);
				return scannerService.listActiveProcesses(auth.userId);
			})
			// ── Notifications ────────────────────────────────────────────────────
			.get(
				"/notifications",
				async ({ request, query }) => {
					const auth = await authenticateInteractive(request);
					const items = await notificationService.list(auth.userId);
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
					const deleted = await notificationService.delete(
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
			// ── Schedules ────────────────────────────────────────────────────────
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
			// ── Reporting ────────────────────────────────────────────────────────
			.get(
				"/channels/:channelId/analytics",
				async ({ request, params, query }) => {
					const auth = await authenticateInteractive(request);
					const ytChannelId = await resolveChannelId(
						params.channelId,
						auth.userId,
					);

					const channel = await prisma.youTubeChannel.findFirst({
						where: { channelId: ytChannelId, userId: auth.userId },
						select: { id: true },
					});
					if (!channel) {
						return new Response(
							JSON.stringify({ error: "Channel not found" }),
							{ status: 404, headers: { "Content-Type": "application/json" } },
						);
					}

					const stats = await prisma.channelDailyStats.findMany({
						where: {
							channelId: channel.id,
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
			)
	);
}
