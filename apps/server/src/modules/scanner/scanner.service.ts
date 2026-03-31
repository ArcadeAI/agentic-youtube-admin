import type { PrismaClient } from "@agentic-youtube-admin/db";
import type { Mastra } from "@mastra/core";
import type { SchedulerService } from "../scheduler/scheduler.service";

export class ScannerService {
	private mastra: Mastra | null = null;

	constructor(
		private prisma: PrismaClient,
		private schedulerService: SchedulerService,
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
		const scanRun = await this.schedulerService.createScanRun(
			scheduleId,
			scanType,
		);

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
				default:
					throw new Error(`Unknown scan type: ${scanType}`);
			}

			await this.schedulerService.completeScanRun(
				scanRun.id,
				"success",
				result,
			);
			await this.schedulerService.updateScheduleLastRun(scheduleId, "success");
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
