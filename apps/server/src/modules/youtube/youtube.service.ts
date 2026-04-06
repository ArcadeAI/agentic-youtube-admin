import { callTool, TOOL_NAMES } from "@agentic-youtube-admin/arcade";
import { mapChannelDailyStatsToDb } from "@agentic-youtube-admin/arcade/mappers/channel-daily-stats.mapper";
import { mapDeviceStatsToDb } from "@agentic-youtube-admin/arcade/mappers/device-stats.mapper";
import { mapLiveStreamPointToDb } from "@agentic-youtube-admin/arcade/mappers/live-stream.mapper";
import { mapRetentionToDb } from "@agentic-youtube-admin/arcade/mappers/retention.mapper";
import { mapTrafficSourceToDb } from "@agentic-youtube-admin/arcade/mappers/traffic-source.mapper";
import { mapOwnedVideoToDb } from "@agentic-youtube-admin/arcade/mappers/video.mapper";
import { mapVideoDailyStatsToDb } from "@agentic-youtube-admin/arcade/mappers/video-daily-stats.mapper";
import {
	getChannelAnalyticsResponseSchema,
	getMyChannelResponseSchema,
} from "@agentic-youtube-admin/arcade/schemas/channel-analytics";
import { backfillVideoDeviceStatsResponseSchema } from "@agentic-youtube-admin/arcade/schemas/device-stats";
import { discoverAllVideosResponseSchema } from "@agentic-youtube-admin/arcade/schemas/discover-videos";
import { getLiveStreamTimelineResponseSchema } from "@agentic-youtube-admin/arcade/schemas/live-stream";
import { getVideoRetentionCurveResponseSchema } from "@agentic-youtube-admin/arcade/schemas/retention";
import { backfillVideoTrafficSourcesResponseSchema } from "@agentic-youtube-admin/arcade/schemas/traffic-sources";
import { backfillVideoAnalyticsResponseSchema } from "@agentic-youtube-admin/arcade/schemas/video-analytics";
import type { PrismaClient } from "@agentic-youtube-admin/db";

export class YouTubeService {
	constructor(private prisma: PrismaClient) {}

	async getMyChannel(arcadeUserId: string) {
		const result = await callTool(
			TOOL_NAMES.GET_MY_CHANNEL,
			arcadeUserId,
			{},
			getMyChannelResponseSchema,
		);
		if (!result.ok) {
			throw result.error;
		}
		return result.data;
	}

	async connectChannel(userId: string, arcadeUserId: string) {
		const channelInfo = await this.getMyChannel(arcadeUserId);
		return this.saveChannel(userId, channelInfo);
	}

	async saveChannel(
		userId: string,
		channelInfo: {
			channelId: string;
			title: string;
			thumbnail?: string | null;
			customUrl?: string | null;
		},
	) {
		const channel = await this.prisma.youTubeChannel.upsert({
			where: { channelId: channelInfo.channelId },
			create: {
				userId,
				channelId: channelInfo.channelId,
				channelTitle: channelInfo.title,
				channelThumbnail: channelInfo.thumbnail ?? null,
				customUrl: channelInfo.customUrl ?? null,
			},
			update: {
				channelTitle: channelInfo.title,
				channelThumbnail: channelInfo.thumbnail ?? null,
				customUrl: channelInfo.customUrl ?? null,
			},
		});

		return channel;
	}

	async discoverAndSyncVideos(
		_userId: string,
		arcadeUserId: string,
		channelDbId: string,
	) {
		const channel = await this.prisma.youTubeChannel.findUniqueOrThrow({
			where: { id: channelDbId },
			select: { channelId: true },
		});

		const result = await callTool(
			TOOL_NAMES.DISCOVER_ALL_VIDEOS,
			arcadeUserId,
			{ channel_id: channel.channelId },
			discoverAllVideosResponseSchema,
		);
		if (!result.ok) {
			throw result.error;
		}

		const { videos } = result.data;
		const upserted = [];

		for (const video of videos) {
			const dbInput = mapOwnedVideoToDb(video, channelDbId);
			const record = await this.prisma.video.upsert({
				where: { videoId: video.videoId },
				create: dbInput,
				update: {
					title: dbInput.title,
					description: dbInput.description,
					thumbnailUrl: dbInput.thumbnailUrl,
					duration: dbInput.duration,
					tags: dbInput.tags,
					categoryId: dbInput.categoryId,
					liveBroadcastContent: dbInput.liveBroadcastContent,
					contentType: dbInput.contentType,
					width: dbInput.width,
					height: dbInput.height,
					aspectRatio: dbInput.aspectRatio,
					currentViews: dbInput.currentViews,
					currentLikes: dbInput.currentLikes,
					currentComments: dbInput.currentComments,
				},
			});
			upserted.push(record);
		}

		return {
			totalDiscovered: result.data.totalVideosDiscovered,
			totalUpserted: upserted.length,
			contentTypeCounts: result.data.contentTypeCounts,
		};
	}

	async syncChannelAnalytics(
		_userId: string,
		arcadeUserId: string,
		channelDbId: string,
		startDate: string,
		endDate: string,
	) {
		const channel = await this.prisma.youTubeChannel.findUniqueOrThrow({
			where: { id: channelDbId },
			select: { channelId: true },
		});

		const result = await callTool(
			TOOL_NAMES.GET_CHANNEL_ANALYTICS,
			arcadeUserId,
			{
				channel_id: channel.channelId,
				start_date: startDate,
				end_date: endDate,
			},
			getChannelAnalyticsResponseSchema,
		);
		if (!result.ok) {
			throw result.error;
		}

		const videoCount = await this.prisma.video.count({
			where: { channelId: channelDbId },
		});

		const totalViews = await this.prisma.video.aggregate({
			where: { channelId: channelDbId },
			_sum: { currentViews: true },
		});

		const upserted = [];
		for (const row of result.data) {
			const dbInput = mapChannelDailyStatsToDb(
				row,
				channelDbId,
				totalViews._sum.currentViews ?? BigInt(0),
				videoCount,
			);
			const record = await this.prisma.channelDailyStats.upsert({
				where: {
					channelId_date: {
						channelId: channelDbId,
						date: new Date(row.date),
					},
				},
				create: dbInput,
				update: {
					subscriberCount: dbInput.subscriberCount,
					totalViews: dbInput.totalViews,
					totalVideos: dbInput.totalVideos,
					subscribersGained: dbInput.subscribersGained,
					subscribersLost: dbInput.subscribersLost,
					viewsGained: dbInput.viewsGained,
					estimatedMinutesWatched: dbInput.estimatedMinutesWatched,
					averageViewDuration: dbInput.averageViewDuration,
				},
			});
			upserted.push(record);
		}

		return { totalDays: upserted.length };
	}

	async backfillVideoAnalytics(
		_userId: string,
		arcadeUserId: string,
		videoIds: string[],
		startDate: string,
		endDate: string,
	) {
		const videoIdMap = await this.buildVideoIdMap(videoIds);

		const result = await callTool(
			TOOL_NAMES.BACKFILL_VIDEO_ANALYTICS,
			arcadeUserId,
			{ video_ids: videoIds, start_date: startDate, end_date: endDate },
			backfillVideoAnalyticsResponseSchema,
		);
		if (!result.ok) {
			throw result.error;
		}

		let totalUpserted = 0;
		for (const [ytVideoId, rows] of Object.entries(result.data.data)) {
			const dbVideoId = videoIdMap.get(ytVideoId);
			if (!dbVideoId) continue;

			for (const row of rows) {
				const dbInput = mapVideoDailyStatsToDb(row, dbVideoId);
				await this.prisma.videoDailyStats.upsert({
					where: {
						videoId_date: {
							videoId: dbVideoId,
							date: new Date(row.date),
						},
					},
					create: dbInput,
					update: {
						views: dbInput.views,
						estimatedMinutesWatched: dbInput.estimatedMinutesWatched,
						averageViewDuration: dbInput.averageViewDuration,
						averageViewPercentage: dbInput.averageViewPercentage,
						likes: dbInput.likes,
						comments: dbInput.comments,
						shares: dbInput.shares,
						videosAddedToPlaylists: dbInput.videosAddedToPlaylists,
						videosRemovedFromPlaylists: dbInput.videosRemovedFromPlaylists,
						subscribersGained: dbInput.subscribersGained,
						subscribersLost: dbInput.subscribersLost,
						engagedViews: dbInput.engagedViews,
						redViews: dbInput.redViews,
						estimatedRedMinutesWatched: dbInput.estimatedRedMinutesWatched,
						cardImpressions: dbInput.cardImpressions,
						cardClicks: dbInput.cardClicks,
						cardClickRate: dbInput.cardClickRate,
						cardTeaserImpressions: dbInput.cardTeaserImpressions,
						cardTeaserClicks: dbInput.cardTeaserClicks,
						cardTeaserClickRate: dbInput.cardTeaserClickRate,
						averageConcurrentViewers: dbInput.averageConcurrentViewers,
						peakConcurrentViewers: dbInput.peakConcurrentViewers,
					},
				});
				totalUpserted++;
			}
		}

		return { totalUpserted, metadata: result.data.metadata };
	}

	async backfillTrafficSources(
		_userId: string,
		arcadeUserId: string,
		videoIds: string[],
		startDate: string,
		endDate: string,
	) {
		const videoIdMap = await this.buildVideoIdMap(videoIds);

		const result = await callTool(
			TOOL_NAMES.BACKFILL_VIDEO_TRAFFIC_SOURCES,
			arcadeUserId,
			{ video_ids: videoIds, start_date: startDate, end_date: endDate },
			backfillVideoTrafficSourcesResponseSchema,
		);
		if (!result.ok) {
			throw result.error;
		}

		let totalUpserted = 0;
		for (const [ytVideoId, rows] of Object.entries(result.data.data)) {
			const dbVideoId = videoIdMap.get(ytVideoId);
			if (!dbVideoId) continue;

			for (const row of rows) {
				const dbInput = mapTrafficSourceToDb(row, dbVideoId);
				await this.prisma.videoTrafficSourceStats.upsert({
					where: {
						videoId_date_trafficSourceType_trafficSourceDetail: {
							videoId: dbVideoId,
							date: new Date(row.date),
							trafficSourceType: row.trafficSourceType,
							trafficSourceDetail: "",
						},
					},
					create: dbInput,
					update: {
						views: dbInput.views,
						estimatedMinutesWatched: dbInput.estimatedMinutesWatched,
					},
				});
				totalUpserted++;
			}
		}

		return { totalUpserted, metadata: result.data.metadata };
	}

	async backfillDeviceStats(
		_userId: string,
		arcadeUserId: string,
		videoIds: string[],
		startDate: string,
		endDate: string,
	) {
		const videoIdMap = await this.buildVideoIdMap(videoIds);

		const result = await callTool(
			TOOL_NAMES.BACKFILL_VIDEO_DEVICE_STATS,
			arcadeUserId,
			{ video_ids: videoIds, start_date: startDate, end_date: endDate },
			backfillVideoDeviceStatsResponseSchema,
		);
		if (!result.ok) {
			throw result.error;
		}

		let totalUpserted = 0;
		for (const [ytVideoId, rows] of Object.entries(result.data.data)) {
			const dbVideoId = videoIdMap.get(ytVideoId);
			if (!dbVideoId) continue;

			for (const row of rows) {
				const dbInput = mapDeviceStatsToDb(row, dbVideoId);
				await this.prisma.videoDeviceStats.upsert({
					where: {
						videoId_date_deviceType_operatingSystem: {
							videoId: dbVideoId,
							date: new Date(row.date),
							deviceType: row.deviceType,
							operatingSystem: "",
						},
					},
					create: dbInput,
					update: {
						views: dbInput.views,
						estimatedMinutesWatched: dbInput.estimatedMinutesWatched,
						averageViewDuration: dbInput.averageViewDuration,
					},
				});
				totalUpserted++;
			}
		}

		return { totalUpserted, metadata: result.data.metadata };
	}

	async getRetentionCurve(
		_userId: string,
		arcadeUserId: string,
		ytVideoId: string,
		startDate: string,
		endDate: string,
	) {
		const video = await this.prisma.video.findUniqueOrThrow({
			where: { videoId: ytVideoId },
			select: { id: true },
		});

		const result = await callTool(
			TOOL_NAMES.GET_VIDEO_RETENTION_CURVE,
			arcadeUserId,
			{ video_id: ytVideoId, start_date: startDate, end_date: endDate },
			getVideoRetentionCurveResponseSchema,
		);
		if (!result.ok) {
			throw result.error;
		}

		const calculatedAt = new Date();
		const upserted = [];

		for (const point of result.data) {
			const dbInput = mapRetentionToDb(point, video.id, calculatedAt);
			const record = await this.prisma.videoRetention.upsert({
				where: {
					videoId_elapsedRatio: {
						videoId: video.id,
						elapsedRatio: point.elapsedRatio,
					},
				},
				create: dbInput,
				update: {
					audienceWatchRatio: dbInput.audienceWatchRatio,
					relativeRetentionPerformance: dbInput.relativeRetentionPerformance,
					calculatedAt: dbInput.calculatedAt,
				},
			});
			upserted.push(record);
		}

		return { totalPoints: upserted.length };
	}

	async getLiveStreamTimeline(
		_userId: string,
		arcadeUserId: string,
		ytVideoId: string,
		streamDate: string,
	) {
		const video = await this.prisma.video.findUniqueOrThrow({
			where: { videoId: ytVideoId },
			select: { id: true },
		});

		const result = await callTool(
			TOOL_NAMES.GET_LIVE_STREAM_TIMELINE,
			arcadeUserId,
			{ video_id: ytVideoId, stream_date: streamDate },
			getLiveStreamTimelineResponseSchema,
		);
		if (!result.ok) {
			throw result.error;
		}

		const upserted = [];
		for (const point of result.data) {
			const dbInput = mapLiveStreamPointToDb(point, video.id);
			const record = await this.prisma.liveStreamTimeline.upsert({
				where: {
					videoId_livestreamPosition: {
						videoId: video.id,
						livestreamPosition: point.livestreamPosition,
					},
				},
				create: dbInput,
				update: {
					averageConcurrentViewers: dbInput.averageConcurrentViewers,
					peakConcurrentViewers: dbInput.peakConcurrentViewers,
				},
			});
			upserted.push(record);
		}

		return { totalPoints: upserted.length };
	}

	// --------------- Read-only query methods ---------------

	async listChannels(userId: string) {
		return this.prisma.youTubeChannel.findMany({
			where: { userId },
			orderBy: { createdAt: "desc" },
		});
	}

	async listVideos(channelDbId: string, page: number, pageSize: number) {
		const skip = (page - 1) * pageSize;
		const [videos, total] = await Promise.all([
			this.prisma.video.findMany({
				where: { channelId: channelDbId },
				orderBy: { publishedAt: "desc" },
				skip,
				take: pageSize,
			}),
			this.prisma.video.count({
				where: { channelId: channelDbId },
			}),
		]);
		return {
			data: videos,
			pagination: {
				page,
				pageSize,
				total,
				totalPages: Math.ceil(total / pageSize),
			},
		};
	}

	async getChannelDailyStats(
		channelDbId: string,
		startDate: string,
		endDate: string,
	) {
		return this.prisma.channelDailyStats.findMany({
			where: {
				channelId: channelDbId,
				date: {
					gte: new Date(startDate),
					lte: new Date(endDate),
				},
			},
			orderBy: { date: "asc" },
		});
	}

	async getVideoDailyStats(
		ytVideoId: string,
		startDate: string,
		endDate: string,
	) {
		const video = await this.prisma.video.findUniqueOrThrow({
			where: { videoId: ytVideoId },
			select: { id: true },
		});
		return this.prisma.videoDailyStats.findMany({
			where: {
				videoId: video.id,
				date: {
					gte: new Date(startDate),
					lte: new Date(endDate),
				},
			},
			orderBy: { date: "asc" },
		});
	}

	async getRetentionData(ytVideoId: string) {
		const video = await this.prisma.video.findUniqueOrThrow({
			where: { videoId: ytVideoId },
			select: { id: true },
		});
		return this.prisma.videoRetention.findMany({
			where: { videoId: video.id },
			orderBy: { elapsedRatio: "asc" },
		});
	}

	async getChannel(channelDbId: string) {
		return this.prisma.youTubeChannel.findUniqueOrThrow({
			where: { id: channelDbId },
		});
	}

	async getVideoIdsForChannel(channelDbId: string) {
		const videos = await this.prisma.video.findMany({
			where: { channelId: channelDbId },
			select: { videoId: true },
		});
		return videos.map((v) => v.videoId);
	}

	async markSyncComplete(channelDbId: string) {
		return this.prisma.youTubeChannel.update({
			where: { id: channelDbId },
			data: {
				lastSyncAt: new Date(),
				lastSyncStatus: "success",
				lastSyncError: null,
			},
		});
	}

	// --------------- Transcription ---------------

	async transcribeVideos(
		channelDbId: string,
		transcriptionService: {
			transcribeVideo(
				channelYtId: string,
				videoId: string,
				title: string,
			): Promise<{ success: boolean; method: string | null }>;
		},
		options?: { videoId?: string; limit?: number },
	): Promise<{ transcribed: number; skipped: number; failed: number }> {
		const channel = await this.prisma.youTubeChannel.findUniqueOrThrow({
			where: { id: channelDbId },
			select: { channelId: true },
		});

		const untranscribed = await this.prisma.video.findMany({
			where: {
				channelId: channelDbId,
				transcribedAt: null,
				...(options?.videoId ? { videoId: options.videoId } : {}),
			},
			select: { id: true, videoId: true, title: true },
			...(options?.limit ? { take: options.limit } : {}),
		});

		if (untranscribed.length === 0) {
			return { transcribed: 0, skipped: 0, failed: 0 };
		}

		let transcribed = 0;
		let skipped = 0;
		let failed = 0;

		for (const video of untranscribed) {
			try {
				const result = await transcriptionService.transcribeVideo(
					channel.channelId,
					video.videoId,
					video.title,
				);

				if (result.success && result.method) {
					await this.prisma.video.update({
						where: { id: video.id },
						data: { transcribedAt: new Date() },
					});
					transcribed++;
				} else if (result.success && !result.method) {
					// Already on disk, mark as transcribed
					await this.prisma.video.update({
						where: { id: video.id },
						data: { transcribedAt: new Date() },
					});
					skipped++;
				} else {
					failed++;
				}
			} catch (err) {
				console.error(
					`Failed to transcribe video ${video.videoId}:`,
					err instanceof Error ? err.message : err,
				);
				failed++;
			}
		}

		return { transcribed, skipped, failed };
	}

	// --------------- Private helpers ---------------

	private async buildVideoIdMap(
		ytVideoIds: string[],
	): Promise<Map<string, string>> {
		const videos = await this.prisma.video.findMany({
			where: { videoId: { in: ytVideoIds } },
			select: { id: true, videoId: true },
		});
		return new Map(videos.map((v) => [v.videoId, v.id]));
	}
}
