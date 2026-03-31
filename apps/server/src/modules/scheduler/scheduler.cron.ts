import { Cron } from "croner";
import type { SchedulerService } from "./scheduler.service";

export type ScanHandler = (
	scheduleId: string,
	scanType: string,
	userId: string,
	channelId: string | null,
	config: Record<string, unknown> | null,
) => Promise<void>;

export class CronManager {
	private jobs = new Map<string, Cron>();

	constructor(
		private schedulerService: SchedulerService,
		private onScanTriggered: ScanHandler,
	) {}

	async loadFromDb() {
		const schedules = await this.schedulerService.getActiveSchedules();
		for (const schedule of schedules) {
			this.register(
				schedule.id,
				schedule.cronExpression,
				schedule.scanType,
				schedule.userId,
				schedule.channelId,
				schedule.config as Record<string, unknown> | null,
			);
		}
		console.log(`Loaded ${schedules.length} cron schedules`);
	}

	register(
		scheduleId: string,
		cronExpression: string,
		scanType: string,
		userId: string,
		channelId: string | null,
		config: Record<string, unknown> | null,
	) {
		this.remove(scheduleId);

		const job = new Cron(cronExpression, async () => {
			try {
				await this.onScanTriggered(
					scheduleId,
					scanType,
					userId,
					channelId,
					config,
				);
			} catch (err) {
				console.error(`Cron job error for schedule ${scheduleId}:`, err);
			}
		});

		this.jobs.set(scheduleId, job);
	}

	remove(scheduleId: string) {
		const existing = this.jobs.get(scheduleId);
		if (existing) {
			existing.stop();
			this.jobs.delete(scheduleId);
		}
	}

	removeAll() {
		for (const [id, job] of this.jobs) {
			job.stop();
			this.jobs.delete(id);
		}
	}

	getActiveCount(): number {
		return this.jobs.size;
	}
}
