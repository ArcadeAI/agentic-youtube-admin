import prisma from "@agentic-youtube-admin/db";
import { Elysia, t } from "elysia";
import { authenticateInteractive } from "../../middleware/interactive-auth";
import { type LibraryService, slugify } from "../library/library.service";
import { NotificationService } from "../notification/notification.service";
import type {
	DeliveryMethod,
	NotificationType,
} from "../notification/notification.types";
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
 * Compute date coverage info from a sorted array of Date objects.
 * Returns earliest/latest dates, counts, and up to 30 missing dates.
 */
function computeDateCoverage(dates: Date[]) {
	const empty = {
		earliestDate: null as string | null,
		latestDate: null as string | null,
		totalDays: 0,
		expectedDays: 0,
		missingDates: [] as string[],
	};
	if (dates.length === 0) return empty;

	const earliest = dates[0] as Date;
	const latest = dates[dates.length - 1] as Date;
	const msPerDay = 24 * 60 * 60 * 1000;
	const expectedDays =
		Math.round((latest.getTime() - earliest.getTime()) / msPerDay) + 1;

	const dateSet = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
	const missingDates: string[] = [];
	const cursor = new Date(earliest);
	while (cursor <= latest && missingDates.length < 30) {
		const key = cursor.toISOString().slice(0, 10);
		if (!dateSet.has(key)) {
			missingDates.push(key);
		}
		cursor.setDate(cursor.getDate() + 1);
	}

	return {
		earliestDate: earliest.toISOString().slice(0, 10),
		latestDate: latest.toISOString().slice(0, 10),
		totalDays: dates.length,
		expectedDays,
		missingDates,
	};
}

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

export function createInteractiveSessionRoutes(
	scannerService: ScannerService,
	libraryService?: LibraryService,
) {
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
			.post("/processes/tracked-poll", async ({ request }) => {
				const auth = await authenticateInteractive(request);
				const arcadeUserId = await scannerService.resolveArcadeUserId(
					auth.userId,
				);
				try {
					const result = await scannerService.runTrackedDailyPoll(
						auth.userId,
						arcadeUserId,
					);
					await scannerService.notifyScanComplete(
						auth.userId,
						"tracked_daily_poll",
						null,
						result,
					);
					return result;
				} catch (err) {
					await scannerService.notifyScanComplete(
						auth.userId,
						"tracked_daily_poll",
						null,
						undefined,
						err instanceof Error ? err.message : String(err),
					);
					throw err;
				}
			})
			.post(
				"/processes/transcription",
				async ({ request, body }) => {
					const auth = await authenticateInteractive(request);

					let channelDbId: string | null = null;
					if (body.channel_id) {
						const ytChannelId = await resolveChannelId(
							body.channel_id,
							auth.userId,
						);
						const channel = await prisma.youTubeChannel.findFirst({
							where: { userId: auth.userId, channelId: ytChannelId },
							select: { id: true },
						});
						if (channel) {
							channelDbId = channel.id;
						}
					}

					return scannerService.startTranscriptionAsync(
						auth.userId,
						channelDbId,
						{
							videoId: body.video_id ?? undefined,
							limit: body.limit ?? undefined,
						},
					);
				},
				{
					body: t.Object({
						channel_id: t.Optional(t.String()),
						video_id: t.Optional(t.String()),
						limit: t.Optional(t.Number()),
					}),
				},
			)
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
						notificationType: body.notification_type as NotificationType,
						deliveryMethod: body.delivery_method as DeliveryMethod,
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
				"/channels/:channelId/data-coverage",
				async ({ request, params }) => {
					const auth = await authenticateInteractive(request);
					const ytChannelId = await resolveChannelId(
						params.channelId,
						auth.userId,
					);

					// Try owned channel first
					const ownedChannel = await prisma.youTubeChannel.findFirst({
						where: { channelId: ytChannelId, userId: auth.userId },
						select: {
							id: true,
							channelTitle: true,
							customUrl: true,
							channelId: true,
						},
					});

					if (ownedChannel) {
						const channelStatDates = await prisma.channelDailyStats.findMany({
							where: { channelId: ownedChannel.id },
							select: { date: true },
							orderBy: { date: "asc" },
						});

						const latestEntry = await prisma.channelDailyStats.findFirst({
							where: { channelId: ownedChannel.id },
							orderBy: { date: "desc" },
						});

						const videoIds = await prisma.video.findMany({
							where: { channelId: ownedChannel.id },
							select: { id: true },
						});
						const ids = videoIds.map((v) => v.id);

						const videosWithStats =
							ids.length > 0
								? await prisma.videoDailyStats
										.findMany({
											where: { videoId: { in: ids } },
											distinct: ["videoId"],
											select: { videoId: true },
										})
										.then((r) => r.length)
								: 0;

						const videoDateAgg =
							ids.length > 0
								? await prisma.videoDailyStats.aggregate({
										where: { videoId: { in: ids } },
										_min: { date: true },
										_max: { date: true },
										_count: true,
									})
								: null;

						const coverage = computeDateCoverage(
							channelStatDates.map((s) => s.date),
						);

						return {
							channelType: "owned",
							channelId: ytChannelId,
							channelTitle: ownedChannel.channelTitle,
							handle: ownedChannel.customUrl,
							channelDailyStats: {
								...coverage,
								latestEntry: latestEntry
									? {
											date: latestEntry.date,
											viewsGained: latestEntry.viewsGained,
											totalViews: latestEntry.totalViews,
											subscriberCount: latestEntry.subscriberCount,
											subscribersGained: latestEntry.subscribersGained,
											subscribersLost: latestEntry.subscribersLost,
											estimatedMinutesWatched:
												latestEntry.estimatedMinutesWatched,
											averageViewDuration: latestEntry.averageViewDuration,
											totalVideos: latestEntry.totalVideos,
										}
									: null,
							},
							videoDailyStats: {
								totalVideos: videoIds.length,
								videosWithDailyStats: videosWithStats,
								totalRows: videoDateAgg?._count ?? 0,
								earliestDate:
									videoDateAgg?._min?.date?.toISOString().slice(0, 10) ?? null,
								latestDate:
									videoDateAgg?._max?.date?.toISOString().slice(0, 10) ?? null,
							},
						};
					}

					// Try tracked channel
					const trackedChannel = await prisma.trackedChannel.findFirst({
						where: {
							channelId: ytChannelId,
							userId: auth.userId,
						},
						select: {
							id: true,
							channelTitle: true,
							customUrl: true,
							channelId: true,
						},
					});

					if (trackedChannel) {
						const snapshotDates = await prisma.trackedChannelSnapshot.findMany({
							where: { channelId: trackedChannel.id },
							select: { date: true },
							orderBy: { date: "asc" },
						});

						const latestSnapshot =
							await prisma.trackedChannelSnapshot.findFirst({
								where: { channelId: trackedChannel.id },
								orderBy: { date: "desc" },
							});

						const trackedVideoIds = await prisma.trackedVideo.findMany({
							where: { channelId: trackedChannel.id },
							select: { id: true },
						});
						const tvIds = trackedVideoIds.map((v) => v.id);

						const videosWithSnapshots =
							tvIds.length > 0
								? await prisma.trackedVideoSnapshot
										.findMany({
											where: { videoId: { in: tvIds } },
											distinct: ["videoId"],
											select: { videoId: true },
										})
										.then((r) => r.length)
								: 0;

						const videoSnapAgg =
							tvIds.length > 0
								? await prisma.trackedVideoSnapshot.aggregate({
										where: { videoId: { in: tvIds } },
										_min: { date: true },
										_max: { date: true },
										_count: true,
									})
								: null;

						const coverage = computeDateCoverage(
							snapshotDates.map((s) => s.date),
						);

						return {
							channelType: "tracked",
							channelId: ytChannelId,
							channelTitle: trackedChannel.channelTitle,
							handle: trackedChannel.customUrl,
							channelSnapshots: {
								...coverage,
								latestEntry: latestSnapshot
									? {
											date: latestSnapshot.date,
											subscriberCount: latestSnapshot.subscriberCount,
											totalViews: latestSnapshot.totalViews,
											videoCount: latestSnapshot.videoCount,
											subscriberCountHidden:
												latestSnapshot.subscriberCountHidden,
										}
									: null,
							},
							videoSnapshots: {
								totalTrackedVideos: trackedVideoIds.length,
								videosWithSnapshots,
								totalRows: videoSnapAgg?._count ?? 0,
								earliestDate:
									videoSnapAgg?._min?.date?.toISOString().slice(0, 10) ?? null,
								latestDate:
									videoSnapAgg?._max?.date?.toISOString().slice(0, 10) ?? null,
							},
						};
					}

					return new Response(JSON.stringify({ error: "Channel not found" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
				},
				{ params: t.Object({ channelId: t.String() }) },
			)
			.get(
				"/channels/:channelId/analytics",
				async ({ request, params, query }) => {
					const auth = await authenticateInteractive(request);
					const ytChannelId = await resolveChannelId(
						params.channelId,
						auth.userId,
					);

					const dateFilter =
						query.start_date && query.end_date
							? {
									date: {
										gte: new Date(query.start_date),
										lte: new Date(query.end_date),
									},
								}
							: {};

					// Try owned channel first
					const ownedChannel = await prisma.youTubeChannel.findFirst({
						where: { channelId: ytChannelId, userId: auth.userId },
						select: { id: true },
					});
					if (ownedChannel) {
						const stats = await prisma.channelDailyStats.findMany({
							where: { channelId: ownedChannel.id, ...dateFilter },
							orderBy: { date: "desc" },
							take: DEFAULT_PAGE_SIZE,
						});
						return { items: stats };
					}

					// Fall back to tracked channel
					const trackedChannel = await prisma.trackedChannel.findFirst({
						where: { channelId: ytChannelId, userId: auth.userId },
						select: { id: true },
					});
					if (trackedChannel) {
						const snapshots = await prisma.trackedChannelSnapshot.findMany({
							where: { channelId: trackedChannel.id, ...dateFilter },
							orderBy: { date: "desc" },
							take: DEFAULT_PAGE_SIZE,
						});
						return { items: snapshots };
					}

					return new Response(JSON.stringify({ error: "Channel not found" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
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
			// ── Transcriptions ───────────────────────────────────────────────────
			.get(
				"/channels/:channelId/transcriptions",
				async ({ request, params }) => {
					const auth = await authenticateInteractive(request);
					if (!libraryService) {
						return { transcriptions: [] };
					}

					const ytChannelId = params.channelId.startsWith("UC")
						? params.channelId
						: await resolveChannelId(params.channelId, auth.userId);

					const channel =
						(await prisma.youTubeChannel.findFirst({
							where: { channelId: ytChannelId },
							select: { customUrl: true, channelTitle: true },
						})) ??
						(await prisma.trackedChannel.findFirst({
							where: { channelId: ytChannelId },
							select: { customUrl: true, channelTitle: true },
						}));

					if (!channel) {
						return { transcriptions: [] };
					}

					const channelSlug = slugify(
						channel.customUrl ?? channel.channelTitle,
					);
					const files = await libraryService.listTranscriptions(channelSlug);

					// Extract videoIds from filenames: {YYYYMMDD}_{titleSlug}_{videoId}-transcript.txt
					const videoIds = files
						.map(
							(f) =>
								f
									.replace(/-transcript\.txt$/, "")
									.split("_")
									.pop() ?? "",
						)
						.filter(Boolean);

					const [ownedVideos, trackedVideos] = await Promise.all([
						prisma.video.findMany({
							where: {
								videoId: { in: videoIds },
								channel: { channelId: ytChannelId },
							},
							select: {
								videoId: true,
								title: true,
								publishedAt: true,
							},
						}),
						prisma.trackedVideo.findMany({
							where: {
								videoId: { in: videoIds },
								channel: { channelId: ytChannelId },
							},
							select: {
								videoId: true,
								title: true,
								publishedAt: true,
							},
						}),
					]);

					const videoMap = new Map<
						string,
						{ title: string; publishedAt: Date }
					>();
					for (const v of [...ownedVideos, ...trackedVideos]) {
						videoMap.set(v.videoId, {
							title: v.title,
							publishedAt: v.publishedAt,
						});
					}

					return {
						transcriptions: videoIds.map((videoId) => {
							const meta = videoMap.get(videoId);
							return {
								videoId,
								title: meta?.title ?? videoId,
								publishedAt:
									meta?.publishedAt?.toISOString().slice(0, 10) ?? null,
							};
						}),
					};
				},
				{
					params: t.Object({ channelId: t.String() }),
				},
			)
			.get(
				"/videos/:videoId/transcript",
				async ({ request, params }) => {
					const auth = await authenticateInteractive(request);

					const ownedVideo = await prisma.video.findFirst({
						where: {
							videoId: params.videoId,
							channel: { userId: auth.userId },
						},
						select: {
							title: true,
							publishedAt: true,
							transcribedAt: true,
							channel: {
								select: {
									channelId: true,
									customUrl: true,
									channelTitle: true,
								},
							},
						},
					});

					const trackedVideo = !ownedVideo
						? await prisma.trackedVideo.findFirst({
								where: {
									videoId: params.videoId,
									channel: { userId: auth.userId },
								},
								select: {
									title: true,
									publishedAt: true,
									transcribedAt: true,
									channel: {
										select: {
											channelId: true,
											customUrl: true,
											channelTitle: true,
										},
									},
								},
							})
						: null;

					const video = ownedVideo ?? trackedVideo;
					if (!video) {
						return new Response("Video not found", { status: 404 });
					}

					const channelHandle =
						video.channel.customUrl ?? video.channel.channelTitle;

					if (!video.transcribedAt || !libraryService) {
						return {
							status: "not_available",
							videoId: params.videoId,
							title: video.title,
							channel_id: video.channel.channelId,
							start_transcription_args: {
								video_id: params.videoId,
								channel_id_or_handle: channelHandle,
							},
						};
					}

					const channelSlug = slugify(channelHandle);
					const filename = libraryService.getTranscriptionFilename(
						params.videoId,
						video.title,
						video.publishedAt,
					);
					const content = await libraryService.readFileContent(
						channelSlug,
						filename,
					);

					if (!content) {
						return {
							status: "not_available",
							videoId: params.videoId,
							title: video.title,
							channel_id: video.channel.channelId,
							message:
								"Transcript record exists but the file could not be read",
							start_transcription_args: {
								video_id: params.videoId,
								channel_id_or_handle: channelHandle,
							},
						};
					}

					return {
						status: "available",
						videoId: params.videoId,
						title: video.title,
						transcript: content,
					};
				},
				{
					params: t.Object({ videoId: t.String() }),
				},
			)
	);
}
