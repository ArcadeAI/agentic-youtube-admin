import type { PrismaClient } from "@agentic-youtube-admin/db";
import type { Mastra } from "@mastra/core";
import type { NotificationService } from "../notification/notification.service";
import type { SlackDeliveryService } from "../notification/slack-delivery.service";
import {
	formatBackfillComplete,
	formatDailySyncComplete,
	formatScanError,
	formatTrackedPollComplete,
	formatTranscriptionComplete,
} from "../notification/slack-message.formatter";
import type { SchedulerService } from "../scheduler/scheduler.service";

/** In-memory map of scan-run ID → Mastra Run for cancellation support. */
const activeRuns = new Map<
	string,
	{ cancel: () => Promise<void>; workflowName: string }
>();

export class ScannerService {
	private mastra: Mastra | null = null;

	constructor(
		private prisma: PrismaClient,
		private schedulerService: SchedulerService,
		private notificationService?: NotificationService,
		private slackDeliveryService?: SlackDeliveryService,
	) {}

	setMastra(mastra: Mastra) {
		this.mastra = mastra;
	}

	async resolveArcadeUserId(userId: string): Promise<string> {
		const account = await this.prisma.account.findFirst({
			where: { userId, providerId: "arcade" },
		});
		if (!account) {
			throw new Error("User has not linked their Arcade account");
		}
		return account.accountId;
	}

	async handleScheduledScan(
		scheduleId: string,
		scanType: string,
		userId: string,
		channelId: string | null,
		config: Record<string, unknown> | null,
	) {
		const scanRun = await this.schedulerService.createScanRun(scanType, {
			scheduleId,
		});

		try {
			const arcadeUserId = await this.resolveArcadeUserId(userId);

			if (
				(scanType === "owned_backfill" || scanType === "owned_daily_sync") &&
				!channelId
			) {
				throw new Error(`channelId is required for ${scanType}`);
			}

			let result: unknown;
			switch (scanType) {
				case "owned_backfill":
					result = await this.runOwnedBackfill(
						userId,
						arcadeUserId,
						channelId as string,
						config,
					);
					break;
				case "owned_daily_sync":
					result = await this.runOwnedDailySync(
						userId,
						arcadeUserId,
						channelId as string,
					);
					break;
				case "tracked_daily_poll":
					result = await this.runTrackedDailyPoll(userId, arcadeUserId);
					break;
				case "transcription":
					result = await this.runTranscription(userId, channelId);
					break;
				default:
					throw new Error(`Unknown scan type: ${scanType}`);
			}

			await this.schedulerService.completeScanRun(
				scanRun.id,
				"success",
				result,
			);
			await this.schedulerService.updateScheduleLastRun(scheduleId, "success");
			await this.notifyScanComplete(userId, scanType, channelId, result);

			// Auto-trigger transcription after scans that discover videos
			if (
				["owned_backfill", "owned_daily_sync", "tracked_daily_poll"].includes(
					scanType,
				)
			) {
				this.runTranscription(userId, channelId).catch((err) =>
					console.error(
						"Post-scan transcription failed:",
						err instanceof Error ? err.message : err,
					),
				);
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			await this.schedulerService.completeScanRun(
				scanRun.id,
				"error",
				undefined,
				errorMsg,
			);
			await this.schedulerService.updateScheduleLastRun(
				scheduleId,
				"error",
				errorMsg,
			);
			await this.notifyScanComplete(
				userId,
				scanType,
				channelId,
				undefined,
				errorMsg,
			);
		}
	}

	async runOwnedBackfill(
		_userId: string,
		arcadeUserId: string,
		channelDbId: string,
		config: Record<string, unknown> | null,
	) {
		if (!this.mastra) throw new Error("Mastra not initialized");

		const startDate = (config?.startDate as string) ?? this.defaultStartDate();
		const endDate = (config?.endDate as string) ?? this.defaultEndDate();

		const workflow = this.mastra.getWorkflow("ownedChannelBackfill");
		const run = await workflow.createRun();
		const result = await run.start({
			inputData: { arcadeUserId, channelDbId, startDate, endDate },
		});

		if (result.status === "success") {
			return result.result;
		}
		throw new Error(
			`Backfill workflow failed: ${result.status === "failed" ? result.error : result.status}`,
		);
	}

	async runOwnedDailySync(
		_userId: string,
		arcadeUserId: string,
		channelDbId: string,
	) {
		if (!this.mastra) throw new Error("Mastra not initialized");

		const workflow = this.mastra.getWorkflow("ownedChannelDailySync");
		const run = await workflow.createRun();
		const result = await run.start({
			inputData: { arcadeUserId, channelDbId },
		});

		if (result.status === "success") {
			return result.result;
		}
		throw new Error(
			`Daily sync workflow failed: ${result.status === "failed" ? result.error : result.status}`,
		);
	}

	async runTrackedDailyPoll(userId: string, arcadeUserId: string) {
		if (!this.mastra) throw new Error("Mastra not initialized");

		const workflow = this.mastra.getWorkflow("trackedDailyPoll");
		const run = await workflow.createRun();
		const result = await run.start({
			inputData: { userId, arcadeUserId },
		});

		if (result.status === "success") {
			return result.result;
		}
		throw new Error(
			`Tracked poll workflow failed: ${result.status === "failed" ? result.error : result.status}`,
		);
	}

	async runTranscription(
		userId: string,
		channelId: string | null,
		options?: { videoId?: string; limit?: number },
	) {
		if (!this.mastra) throw new Error("Mastra not initialized");

		const workflow = this.mastra.getWorkflow("transcription");
		const run = await workflow.createRun();

		// Determine scope: if channelId is provided, transcribe just that channel
		const scope = channelId ? "owned" : "all";

		const result = await run.start({
			inputData: {
				userId,
				channelDbId: channelId ?? undefined,
				scope,
				videoId: options?.videoId,
				limit: options?.limit,
			},
		});

		if (result.status === "success") {
			return result.result;
		}
		throw new Error(
			`Transcription workflow failed: ${result.status === "failed" ? result.error : result.status}`,
		);
	}

	// ── Async process management ─────────────────────────────────────────────

	/**
	 * Start a backfill in the background. Returns the ScanRun ID immediately.
	 * The workflow runs async; completion updates the ScanRun record.
	 */
	async startBackfillAsync(
		userId: string,
		channelYoutubeId: string,
		config?: { startDate?: string; endDate?: string },
	): Promise<{ processId: string }> {
		if (!this.mastra) throw new Error("Mastra not initialized");

		const arcadeUserId = await this.resolveArcadeUserId(userId);

		// Resolve YouTube channel ID → internal DB ID
		const channel = await this.prisma.youTubeChannel.findFirst({
			where: { userId, channelId: channelYoutubeId },
			select: { id: true },
		});
		if (!channel) {
			throw new Error(
				`Owned channel not found for YouTube ID: ${channelYoutubeId}`,
			);
		}

		const startDate = config?.startDate ?? this.defaultStartDate();
		const endDate = config?.endDate ?? this.defaultEndDate();

		const scanRun = await this.schedulerService.createScanRun(
			"owned_backfill",
			{ userId },
		);

		const workflow = this.mastra.getWorkflow("ownedChannelBackfill");
		const run = await workflow.createRun();

		// Store for cancellation
		activeRuns.set(scanRun.id, {
			cancel: () => run.cancel(),
			workflowName: "ownedChannelBackfill",
		});

		// Fire-and-forget: don't await, but handle completion
		run
			.start({
				inputData: {
					arcadeUserId,
					channelDbId: channel.id,
					startDate,
					endDate,
				},
			})
			.then(async (result) => {
				activeRuns.delete(scanRun.id);
				const status = result.status === "success" ? "success" : "error";
				const error =
					result.status !== "success"
						? `Workflow ${result.status}: ${"error" in result ? result.error : "unknown"}`
						: undefined;
				await this.schedulerService.completeScanRun(
					scanRun.id,
					status as "success" | "error",
					result.status === "success" ? result.result : undefined,
					error,
				);
				await this.notifyScanComplete(
					userId,
					"owned_backfill",
					channel.id,
					result.status === "success" ? result.result : undefined,
					error,
				);
			})
			.catch(async (err) => {
				activeRuns.delete(scanRun.id);
				const errorMsg = err instanceof Error ? err.message : String(err);
				await this.schedulerService.completeScanRun(
					scanRun.id,
					"error",
					undefined,
					errorMsg,
				);
				await this.notifyScanComplete(
					userId,
					"owned_backfill",
					channel.id,
					undefined,
					errorMsg,
				);
			});

		return { processId: scanRun.id };
	}

	/**
	 * Start transcription in the background. Returns the ScanRun ID immediately.
	 */
	async startTranscriptionAsync(
		userId: string,
		channelDbId: string | null,
		options?: { videoId?: string; limit?: number },
	): Promise<{ processId: string }> {
		if (!this.mastra) throw new Error("Mastra not initialized");

		const scanRun = await this.schedulerService.createScanRun("transcription", {
			userId,
		});

		const workflow = this.mastra.getWorkflow("transcription");
		const run = await workflow.createRun();

		activeRuns.set(scanRun.id, {
			cancel: () => run.cancel(),
			workflowName: "transcription",
		});

		const scope = channelDbId ? "owned" : "all";

		run
			.start({
				inputData: {
					userId,
					channelDbId: channelDbId ?? undefined,
					scope,
					videoId: options?.videoId,
					limit: options?.limit,
				},
			})
			.then(async (result) => {
				activeRuns.delete(scanRun.id);
				const status = result.status === "success" ? "success" : "error";
				const error =
					result.status !== "success"
						? `Workflow ${result.status}: ${"error" in result ? result.error : "unknown"}`
						: undefined;
				await this.schedulerService.completeScanRun(
					scanRun.id,
					status as "success" | "error",
					result.status === "success" ? result.result : undefined,
					error,
				);
				await this.notifyScanComplete(
					userId,
					"transcription",
					channelDbId,
					result.status === "success" ? result.result : undefined,
					error,
				);
			})
			.catch(async (err) => {
				activeRuns.delete(scanRun.id);
				const errorMsg = err instanceof Error ? err.message : String(err);
				await this.schedulerService.completeScanRun(
					scanRun.id,
					"error",
					undefined,
					errorMsg,
				);
				await this.notifyScanComplete(
					userId,
					"transcription",
					channelDbId,
					undefined,
					errorMsg,
				);
			});

		return { processId: scanRun.id };
	}

	async getProcessStatus(processId: string) {
		const scanRun = await this.schedulerService.getScanRun(processId);
		if (!scanRun) return null;

		return {
			id: scanRun.id,
			scanType: scanRun.scanType,
			status: scanRun.status,
			startedAt: scanRun.startedAt,
			completedAt: scanRun.completedAt,
			result: scanRun.result,
			error: scanRun.error,
		};
	}

	async cancelProcess(processId: string, userId: string) {
		const scanRun = await this.schedulerService.getScanRun(processId);
		if (!scanRun || scanRun.userId !== userId) return null;
		if (scanRun.status !== "running") return scanRun;

		const entry = activeRuns.get(processId);
		if (entry) {
			await entry.cancel();
			activeRuns.delete(processId);
		}

		return this.schedulerService.cancelScanRun(processId);
	}

	async listActiveProcesses(userId: string) {
		return this.schedulerService.listActiveRunsForUser(userId);
	}

	// ── Notification dispatch ────────────────────────────────────────────────

	async notifyScanComplete(
		userId: string,
		scanType: string,
		channelId: string | null,
		result?: unknown,
		error?: string,
	): Promise<void> {
		if (!this.notificationService || !this.slackDeliveryService) return;

		try {
			const configs = await this.notificationService.getActiveForUserAndType(
				userId,
				scanType,
			);
			if (configs.length === 0) return;

			const channelTitle = await this.resolveChannelTitle(channelId);

			const message = error
				? formatScanError(scanType, error, channelTitle)
				: this.formatSuccessMessage(scanType, result, channelTitle);

			for (const config of configs) {
				if (config.deliveryMethod !== "slack") continue;

				const deliveryConfig = (config.deliveryConfig ?? {}) as {
					channelName?: string;
					dmToSelf?: boolean;
				};

				const sendResult = await this.slackDeliveryService.send(
					userId,
					deliveryConfig,
					message,
				);

				if (sendResult.ok) {
					await this.notificationService.markTriggered(config.id);
				} else {
					console.error(
						`Slack notification failed for config ${config.id}:`,
						sendResult.error,
					);
				}
			}
		} catch (err) {
			console.error("Notification dispatch error:", err);
		}
	}

	private formatSuccessMessage(
		scanType: string,
		result: unknown,
		channelTitle?: string,
	): string {
		switch (scanType) {
			case "owned_backfill":
				return formatBackfillComplete(
					result as {
						completed: boolean;
						retentionPointsTotal: number;
						liveTimelinePointsTotal: number;
					},
					channelTitle,
				);
			case "owned_daily_sync":
				return formatDailySyncComplete(
					result as { completed: boolean; totalUpserted: number },
					channelTitle,
				);
			case "tracked_daily_poll":
				return formatTrackedPollComplete(
					result as {
						channelsPolled: number;
						channelsScored: number;
						channelsFailed: number;
						errors: string[];
					},
				);
			case "transcription":
				return formatTranscriptionComplete(
					result as {
						ownedTranscribed: number;
						trackedTranscribed: number;
						errors: string[];
					},
					channelTitle,
				);
			default:
				return `*Scan Complete: ${scanType.replace(/_/g, " ")}*`;
		}
	}

	private async resolveChannelTitle(
		channelId: string | null,
	): Promise<string | undefined> {
		if (!channelId) return undefined;

		const owned = await this.prisma.youTubeChannel.findFirst({
			where: { id: channelId },
			select: { channelTitle: true },
		});
		if (owned) return owned.channelTitle;

		const tracked = await this.prisma.trackedChannel.findFirst({
			where: { id: channelId },
			select: { channelTitle: true },
		});
		return tracked?.channelTitle ?? undefined;
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	private defaultStartDate(): string {
		const d = new Date();
		d.setFullYear(d.getFullYear() - 2);
		return d.toISOString().split("T")[0] as string;
	}

	private defaultEndDate(): string {
		const d = new Date();
		d.setDate(d.getDate() - 1);
		return d.toISOString().split("T")[0] as string;
	}
}
