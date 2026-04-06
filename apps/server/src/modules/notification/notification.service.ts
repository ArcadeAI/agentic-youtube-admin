import { Prisma, type PrismaClient } from "@agentic-youtube-admin/db";
import type {
	CreateNotificationConfigInput,
	UpdateNotificationConfigInput,
} from "./notification.types";

function jsonOrDbNull(
	val: Record<string, unknown> | undefined | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
	if (val == null) return Prisma.DbNull;
	return val as Prisma.InputJsonValue;
}

export class NotificationService {
	constructor(private prisma: PrismaClient) {}

	async list(userId: string) {
		return this.prisma.notificationConfig.findMany({
			where: { userId },
			orderBy: { createdAt: "desc" },
		});
	}

	async get(id: string, userId: string) {
		return this.prisma.notificationConfig.findFirst({
			where: { id, userId },
		});
	}

	async create(userId: string, input: CreateNotificationConfigInput) {
		return this.prisma.notificationConfig.create({
			data: {
				userId,
				name: input.name,
				channelId: input.channelId ?? null,
				notificationType: input.notificationType,
				conditions: jsonOrDbNull(input.conditions),
				deliveryMethod: input.deliveryMethod,
				deliveryConfig: jsonOrDbNull(input.deliveryConfig),
			},
		});
	}

	async update(
		id: string,
		userId: string,
		input: UpdateNotificationConfigInput,
	) {
		const config = await this.prisma.notificationConfig.findFirst({
			where: { id, userId },
		});
		if (!config) return null;

		return this.prisma.notificationConfig.update({
			where: { id },
			data: {
				name: input.name ?? config.name,
				channelId: input.channelId ?? config.channelId,
				notificationType: input.notificationType ?? config.notificationType,
				...(input.conditions !== undefined
					? { conditions: jsonOrDbNull(input.conditions) }
					: {}),
				deliveryMethod: input.deliveryMethod ?? config.deliveryMethod,
				...(input.deliveryConfig !== undefined
					? { deliveryConfig: jsonOrDbNull(input.deliveryConfig) }
					: {}),
				isActive: input.isActive ?? config.isActive,
			},
		});
	}

	async delete(id: string, userId: string) {
		const config = await this.prisma.notificationConfig.findFirst({
			where: { id, userId },
		});
		if (!config) return null;

		return this.prisma.notificationConfig.delete({ where: { id } });
	}

	async getActiveForChannel(channelId: string) {
		return this.prisma.notificationConfig.findMany({
			where: { channelId, isActive: true },
		});
	}

	async markTriggered(id: string) {
		return this.prisma.notificationConfig.update({
			where: { id },
			data: { lastTriggeredAt: new Date() },
		});
	}

	async getActiveForUserAndType(userId: string, notificationType: string) {
		return this.prisma.notificationConfig.findMany({
			where: { userId, notificationType, isActive: true },
		});
	}

	async getForSchedule(scheduleId: string) {
		const schedule = await this.prisma.scanSchedule.findUnique({
			where: { id: scheduleId },
			select: { notificationConfigId: true },
		});
		if (!schedule?.notificationConfigId) return null;
		return this.prisma.notificationConfig.findFirst({
			where: { id: schedule.notificationConfigId, isActive: true },
		});
	}
}
