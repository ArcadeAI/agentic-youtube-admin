import { Prisma, type PrismaClient } from "@agentic-youtube-admin/db";
import type {
	CreateScheduleInput,
	UpdateScheduleInput,
} from "./scheduler.types";

function jsonOrDbNull(
	val: Record<string, unknown> | undefined | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
	if (val == null) return Prisma.DbNull;
	return val as Prisma.InputJsonValue;
}

export class SchedulerService {
	constructor(private prisma: PrismaClient) {}

	async listSchedules(userId: string) {
		return this.prisma.scanSchedule.findMany({
			where: { userId },
			orderBy: { createdAt: "desc" },
		});
	}

	async getSchedule(id: string, userId: string) {
		return this.prisma.scanSchedule.findFirst({
			where: { id, userId },
		});
	}

	async createSchedule(userId: string, input: CreateScheduleInput) {
		return this.prisma.scanSchedule.create({
			data: {
				userId,
				scanType: input.scanType,
				channelId: input.channelId ?? null,
				cronExpression: input.cronExpression,
				config: jsonOrDbNull(input.config),
			},
		});
	}

	async updateSchedule(id: string, userId: string, input: UpdateScheduleInput) {
		const schedule = await this.prisma.scanSchedule.findFirst({
			where: { id, userId },
		});
		if (!schedule) return null;

		return this.prisma.scanSchedule.update({
			where: { id },
			data: {
				cronExpression: input.cronExpression ?? schedule.cronExpression,
				isActive: input.isActive ?? schedule.isActive,
				...(input.config !== undefined
					? { config: jsonOrDbNull(input.config) }
					: {}),
			},
		});
	}

	async deleteSchedule(id: string, userId: string) {
		const schedule = await this.prisma.scanSchedule.findFirst({
			where: { id, userId },
		});
		if (!schedule) return null;

		return this.prisma.scanSchedule.delete({ where: { id } });
	}

	async getActiveSchedules() {
		return this.prisma.scanSchedule.findMany({
			where: { isActive: true },
		});
	}

	async createScanRun(
		scanType: string,
		opts: { scheduleId?: string; userId?: string } = {},
	) {
		return this.prisma.scanRun.create({
			data: {
				scheduleId: opts.scheduleId ?? null,
				userId: opts.userId ?? null,
				scanType,
				status: "running",
			},
		});
	}

	async completeScanRun(
		id: string,
		status: "success" | "error",
		result?: unknown,
		error?: string,
	) {
		return this.prisma.scanRun.update({
			where: { id },
			data: {
				status,
				completedAt: new Date(),
				result: result
					? (JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue)
					: Prisma.DbNull,
				error: error ?? null,
			},
		});
	}

	async updateScheduleLastRun(
		scheduleId: string,
		status: string,
		error?: string,
	) {
		return this.prisma.scanSchedule.update({
			where: { id: scheduleId },
			data: {
				lastRunAt: new Date(),
				lastRunStatus: status,
				lastRunError: error ?? null,
			},
		});
	}

	async listScanRuns(scheduleId: string, limit = 20) {
		return this.prisma.scanRun.findMany({
			where: { scheduleId },
			orderBy: { startedAt: "desc" },
			take: limit,
		});
	}

	async getScanRun(id: string) {
		return this.prisma.scanRun.findUnique({ where: { id } });
	}

	async listActiveRunsForUser(userId: string) {
		return this.prisma.scanRun.findMany({
			where: { userId, status: "running" },
			orderBy: { startedAt: "desc" },
		});
	}

	async cancelScanRun(id: string) {
		return this.prisma.scanRun.update({
			where: { id },
			data: { status: "canceled", completedAt: new Date() },
		});
	}
}
