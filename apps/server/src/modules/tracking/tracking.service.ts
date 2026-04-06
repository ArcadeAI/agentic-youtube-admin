import { callTool, TOOL_NAMES } from "@agentic-youtube-admin/arcade";
import { mapScoreChannelToDb } from "@agentic-youtube-admin/arcade/mappers/engagement-score.mapper";
import {
	mapPublicChannelInfoToDb,
	mapPublicChannelToSnapshot,
} from "@agentic-youtube-admin/arcade/mappers/tracked-channel.mapper";
import {
	getPublicChannelInfoResponseSchema,
	listPublicChannelVideosResponseSchema,
	searchChannelsResponseSchema,
} from "@agentic-youtube-admin/arcade/schemas/public-channel";
import { scoreChannelResponseSchema } from "@agentic-youtube-admin/arcade/schemas/score-channel";
import { Prisma, type PrismaClient } from "@agentic-youtube-admin/db";

export class TrackingService {
	constructor(private readonly db: PrismaClient) {}

	// ── Channel search ────────────────────────────────────────────────────

	async searchChannels(arcadeUserId: string, query: string) {
		const result = await callTool(
			TOOL_NAMES.SEARCH_CHANNELS,
			arcadeUserId,
			{ query },
			searchChannelsResponseSchema,
		);
		if (!result.ok) throw result.error;
		return result.data;
	}

	// ── Track / untrack ───────────────────────────────────────────────────

	async trackChannel(
		userId: string,
		arcadeUserId: string,
		channelIdOrHandle: string,
	) {
		const result = await callTool(
			TOOL_NAMES.GET_PUBLIC_CHANNEL_INFO,
			arcadeUserId,
			{ channel_id: channelIdOrHandle },
			getPublicChannelInfoResponseSchema,
		);
		if (!result.ok) throw result.error;

		const channelData = mapPublicChannelInfoToDb(result.data, userId);
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);

		const channel = await this.db.trackedChannel.upsert({
			where: {
				userId_channelId: {
					userId,
					channelId: result.data.channelId,
				},
			},
			create: channelData,
			update: {
				isActive: true,
				channelTitle: channelData.channelTitle,
				channelThumbnail: channelData.channelThumbnail,
				customUrl: channelData.customUrl,
				description: channelData.description,
				country: channelData.country,
			},
		});

		const snapshotData = mapPublicChannelToSnapshot(
			result.data,
			channel.id,
			today,
		);
		await this.db.trackedChannelSnapshot.upsert({
			where: {
				channelId_date: {
					channelId: channel.id,
					date: today,
				},
			},
			create: snapshotData,
			update: {
				subscriberCount: snapshotData.subscriberCount,
				totalViews: snapshotData.totalViews,
				videoCount: snapshotData.videoCount,
				subscriberCountHidden: snapshotData.subscriberCountHidden,
			},
		});

		return channel;
	}

	async untrackChannel(userId: string, trackedChannelId: string) {
		return this.db.trackedChannel.update({
			where: { id: trackedChannelId, userId },
			data: { isActive: false },
		});
	}

	// ── Polling ───────────────────────────────────────────────────────────

	async pollChannel(
		userId: string,
		arcadeUserId: string,
		trackedChannelId: string,
	) {
		const channel = await this.db.trackedChannel.findUniqueOrThrow({
			where: { id: trackedChannelId, userId },
			include: { videos: { select: { id: true, videoId: true } } },
		});

		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);

		const yesterday = new Date(today);
		yesterday.setUTCDate(yesterday.getUTCDate() - 1);

		// Fetch channel info
		const channelResult = await callTool(
			TOOL_NAMES.GET_PUBLIC_CHANNEL_INFO,
			arcadeUserId,
			{ channel_id: channel.channelId },
			getPublicChannelInfoResponseSchema,
		);
		if (!channelResult.ok) {
			await this.db.trackedChannel.update({
				where: { id: trackedChannelId },
				data: {
					lastPollError: channelResult.error.message,
					lastPolledAt: new Date(),
				},
			});
			throw channelResult.error;
		}

		// Upsert channel snapshot
		const snapshotData = mapPublicChannelToSnapshot(
			channelResult.data,
			trackedChannelId,
			today,
		);
		await this.db.trackedChannelSnapshot.upsert({
			where: {
				channelId_date: {
					channelId: trackedChannelId,
					date: today,
				},
			},
			create: snapshotData,
			update: {
				subscriberCount: snapshotData.subscriberCount,
				totalViews: snapshotData.totalViews,
				videoCount: snapshotData.videoCount,
				subscriberCountHidden: snapshotData.subscriberCountHidden,
			},
		});

		// Fetch video stats via ListPublicChannelVideos (includes views/likes/comments)
		if (channel.videos.length > 0) {
			const videoIdMap = new Map<string, string>(
				channel.videos.map((v: { id: string; videoId: string }) => [
					v.videoId,
					v.id,
				]),
			);

			// Fetch enough videos to cover tracked ones
			let nextPageToken: string | null = null;
			const statsMap = new Map<
				string,
				{ views: number; likes: number; comments: number }
			>();

			do {
				const params: Record<string, unknown> = {
					channel_id_or_handle: channel.channelId,
					num_videos: 50,
				};
				if (nextPageToken) params.next_page_token = nextPageToken;

				const videoListResult = await callTool(
					TOOL_NAMES.LIST_PUBLIC_CHANNEL_VIDEOS,
					arcadeUserId,
					params,
					listPublicChannelVideosResponseSchema,
				);
				if (!videoListResult.ok) break;

				for (const v of videoListResult.data.videos) {
					if (videoIdMap.has(v.video_id)) {
						statsMap.set(v.video_id, {
							views: v.views,
							likes: v.likes,
							comments: v.comments,
						});
					}
				}

				// Stop paginating once we've found stats for all tracked videos
				if (statsMap.size >= videoIdMap.size) break;
				nextPageToken = videoListResult.data.next_page_token ?? null;
			} while (nextPageToken);

			if (statsMap.size > 0) {
				// Get previous snapshots for delta computation
				type PrevSnapshot = {
					videoId: string;
					viewCount: bigint;
					likeCount: number;
					commentCount: number;
				};
				const previousSnapshots: PrevSnapshot[] =
					await this.db.trackedVideoSnapshot.findMany({
						where: {
							video: { channelId: trackedChannelId },
							date: yesterday,
						},
						select: {
							videoId: true,
							viewCount: true,
							likeCount: true,
							commentCount: true,
						},
					});
				const prevMap = new Map<string, PrevSnapshot>(
					previousSnapshots.map((s) => [s.videoId, s]),
				);

				for (const [ytVideoId, stats] of statsMap) {
					const dbVideoId = videoIdMap.get(ytVideoId);
					if (!dbVideoId) continue;

					const prev = prevMap.get(dbVideoId);
					const viewCount = BigInt(stats.views);
					const likeCount = stats.likes;
					const commentCount = stats.comments;

					const videoSnapshotData = {
						videoId: dbVideoId,
						date: today,
						viewCount,
						likeCount,
						commentCount,
						viewsDelta: prev ? viewCount - prev.viewCount : null,
						likesDelta: prev ? likeCount - prev.likeCount : null,
						commentsDelta: prev ? commentCount - prev.commentCount : null,
					};

					await this.db.trackedVideoSnapshot.upsert({
						where: {
							videoId_date: {
								videoId: dbVideoId,
								date: today,
							},
						},
						create: videoSnapshotData,
						update: {
							viewCount: videoSnapshotData.viewCount,
							likeCount: videoSnapshotData.likeCount,
							commentCount: videoSnapshotData.commentCount,
							viewsDelta: videoSnapshotData.viewsDelta,
							likesDelta: videoSnapshotData.likesDelta,
							commentsDelta: videoSnapshotData.commentsDelta,
						},
					});
				}
			}
		}

		// Update channel metadata
		await this.db.trackedChannel.update({
			where: { id: trackedChannelId },
			data: {
				channelTitle: channelResult.data.title,
				channelThumbnail: channelResult.data.thumbnail ?? null,
				customUrl: channelResult.data.customUrl ?? null,
				description: channelResult.data.description ?? null,
				country: channelResult.data.country ?? null,
				lastPolledAt: new Date(),
				lastPollError: null,
			},
		});

		return { channelId: trackedChannelId, polledAt: new Date() };
	}

	// ── Scoring ───────────────────────────────────────────────────────────

	async scoreChannel(
		arcadeUserId: string,
		channelIdOrHandle: string,
		numVideos: number,
		date?: string,
	) {
		const result = await callTool(
			TOOL_NAMES.SCORE_CHANNEL,
			arcadeUserId,
			{
				channel_id_or_handle: channelIdOrHandle,
				num_videos: numVideos,
				...(date ? { date } : {}),
			},
			scoreChannelResponseSchema,
		);
		if (!result.ok) throw result.error;
		return result.data;
	}

	async saveEngagementScore(
		trackedChannelId: string,
		score: Awaited<ReturnType<typeof this.scoreChannel>>,
		periodType: string,
		periodStart: Date,
		periodEnd: Date,
	) {
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);

		const formulaVersion = "v1";
		const data = mapScoreChannelToDb(
			score,
			trackedChannelId,
			today,
			periodType,
			periodStart,
			periodEnd,
			formulaVersion,
		);

		return this.db.channelEngagementScore.upsert({
			where: {
				channelId_date_periodType_formulaVersion: {
					channelId: trackedChannelId,
					date: today,
					periodType,
					formulaVersion,
				},
			},
			create: data,
			update: {
				score: data.score,
				inputData: data.inputData,
				periodStart,
				periodEnd,
			},
		});
	}

	// ── Discover videos ──────────────────────────────────────────────────

	async discoverTrackedVideos(
		userId: string,
		arcadeUserId: string,
		trackedChannelId: string,
	) {
		const channel = await this.db.trackedChannel.findUniqueOrThrow({
			where: { id: trackedChannelId, userId },
		});

		// Paginate through all videos using ListPublicChannelVideos
		let nextPageToken: string | null = null;
		let upsertedCount = 0;
		const batchSize = 50;

		do {
			const params: Record<string, unknown> = {
				channel_id_or_handle: channel.channelId,
				num_videos: batchSize,
			};
			if (nextPageToken) params.next_page_token = nextPageToken;

			const result = await callTool(
				TOOL_NAMES.LIST_PUBLIC_CHANNEL_VIDEOS,
				arcadeUserId,
				params,
				listPublicChannelVideosResponseSchema,
			);
			if (!result.ok) throw result.error;

			for (const video of result.data.videos) {
				await this.db.trackedVideo.upsert({
					where: { videoId: video.video_id },
					create: {
						channelId: trackedChannelId,
						videoId: video.video_id,
						title: video.title,
						description: video.description ?? null,
						thumbnailUrl: video.thumbnail ?? null,
						publishedAt: new Date(video.published_at),
					},
					update: {
						title: video.title,
						description: video.description ?? null,
						thumbnailUrl: video.thumbnail ?? null,
					},
				});
				upsertedCount++;
			}

			nextPageToken = result.data.next_page_token ?? null;
		} while (nextPageToken);

		return {
			totalDiscovered: upsertedCount,
			upsertedCount,
		};
	}

	// ── Brand CRUD ────────────────────────────────────────────────────────

	async listBrands(userId: string) {
		return this.db.brand.findMany({
			where: { userId },
			orderBy: { name: "asc" },
		});
	}

	async createBrand(data: {
		userId: string;
		name: string;
		logoUrl?: string;
		website?: string;
		notes?: string;
	}) {
		return this.db.brand.create({ data });
	}

	async updateBrand(
		id: string,
		data: {
			name?: string;
			logoUrl?: string | null;
			website?: string | null;
			notes?: string | null;
		},
	) {
		return this.db.brand.update({ where: { id }, data });
	}

	async deleteBrand(id: string) {
		return this.db.brand.delete({ where: { id } });
	}

	// ── SponsoredVideo CRUD ──────────────────────────────────────────────

	async listSponsoredVideos(filters: {
		userId?: string;
		brandId?: string;
		videoId?: string;
	}) {
		return this.db.sponsoredVideo.findMany({
			where: {
				...(filters.brandId ? { brandId: filters.brandId } : {}),
				...(filters.videoId ? { videoId: filters.videoId } : {}),
				...(filters.userId ? { brand: { userId: filters.userId } } : {}),
			},
			include: {
				brand: true,
				video: true,
			},
			orderBy: { createdAt: "desc" },
		});
	}

	async createSponsoredVideo(data: {
		videoId: string;
		brandId: string;
		campaignName?: string;
		paymentAmount?: number;
		paymentCurrency?: string;
		sponsorshipType?: string;
		contractedAt?: string;
		expectedReleaseAt?: string;
		actualReleaseAt?: string;
		deliverables?: string;
		notes?: string;
		metadata?: Record<string, unknown>;
	}) {
		return this.db.sponsoredVideo.create({
			data: {
				videoId: data.videoId,
				brandId: data.brandId,
				campaignName: data.campaignName ?? "",
				paymentAmount: data.paymentAmount,
				paymentCurrency: data.paymentCurrency,
				sponsorshipType: data.sponsorshipType,
				contractedAt: data.contractedAt
					? new Date(data.contractedAt)
					: undefined,
				expectedReleaseAt: data.expectedReleaseAt
					? new Date(data.expectedReleaseAt)
					: undefined,
				actualReleaseAt: data.actualReleaseAt
					? new Date(data.actualReleaseAt)
					: undefined,
				deliverables: data.deliverables,
				notes: data.notes,
				metadata: data.metadata
					? (data.metadata as Prisma.InputJsonValue)
					: undefined,
			},
		});
	}

	async updateSponsoredVideo(
		id: string,
		data: {
			campaignName?: string;
			paymentAmount?: number | null;
			paymentCurrency?: string;
			sponsorshipType?: string | null;
			contractedAt?: string | null;
			expectedReleaseAt?: string | null;
			actualReleaseAt?: string | null;
			deliverables?: string | null;
			notes?: string | null;
			metadata?: Record<string, unknown> | null;
		},
	) {
		return this.db.sponsoredVideo.update({
			where: { id },
			data: {
				...data,
				metadata:
					data.metadata !== undefined
						? data.metadata
							? (data.metadata as Prisma.InputJsonValue)
							: Prisma.DbNull
						: undefined,
				contractedAt:
					data.contractedAt !== undefined
						? data.contractedAt
							? new Date(data.contractedAt)
							: null
						: undefined,
				expectedReleaseAt:
					data.expectedReleaseAt !== undefined
						? data.expectedReleaseAt
							? new Date(data.expectedReleaseAt)
							: null
						: undefined,
				actualReleaseAt:
					data.actualReleaseAt !== undefined
						? data.actualReleaseAt
							? new Date(data.actualReleaseAt)
							: null
						: undefined,
			},
		});
	}

	async deleteSponsoredVideo(id: string) {
		return this.db.sponsoredVideo.delete({ where: { id } });
	}

	// --------------- Transcription ---------------

	async transcribeTrackedVideos(
		trackedChannelId: string,
		transcriptionService: {
			transcribeVideo(
				channelYtId: string,
				videoId: string,
				title: string,
			): Promise<{ success: boolean; method: string | null }>;
		},
	): Promise<{ transcribed: number; skipped: number; failed: number }> {
		const channel = await this.db.trackedChannel.findUniqueOrThrow({
			where: { id: trackedChannelId },
			select: { channelId: true },
		});

		const untranscribed = await this.db.trackedVideo.findMany({
			where: { channelId: trackedChannelId, transcribedAt: null },
			select: { id: true, videoId: true, title: true },
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
					await this.db.trackedVideo.update({
						where: { id: video.id },
						data: { transcribedAt: new Date() },
					});
					transcribed++;
				} else if (result.success && !result.method) {
					// Already on disk, mark as transcribed
					await this.db.trackedVideo.update({
						where: { id: video.id },
						data: { transcribedAt: new Date() },
					});
					skipped++;
				} else {
					failed++;
				}
			} catch (err) {
				console.error(
					`Failed to transcribe tracked video ${video.videoId}:`,
					err instanceof Error ? err.message : err,
				);
				failed++;
			}
		}

		return { transcribed, skipped, failed };
	}
}
