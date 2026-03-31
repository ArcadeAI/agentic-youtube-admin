import { z } from "zod";

export const notificationTypes = [
	"new_video",
	"milestone_views",
	"engagement_drop",
	"engagement_spike",
	"subscriber_change",
	"custom",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export const deliveryMethods = ["email", "webhook", "slack", "in_app"] as const;
export type DeliveryMethod = (typeof deliveryMethods)[number];

export const createNotificationConfigSchema = z.object({
	name: z.string().min(1),
	channelId: z.string().optional(),
	notificationType: z.enum(notificationTypes),
	conditions: z.record(z.string(), z.unknown()).optional(),
	deliveryMethod: z.enum(deliveryMethods),
	deliveryConfig: z.record(z.string(), z.unknown()).optional(),
});

export type CreateNotificationConfigInput = z.infer<
	typeof createNotificationConfigSchema
>;

export const updateNotificationConfigSchema = z.object({
	name: z.string().min(1).optional(),
	channelId: z.string().optional(),
	notificationType: z.enum(notificationTypes).optional(),
	conditions: z.record(z.string(), z.unknown()).optional(),
	deliveryMethod: z.enum(deliveryMethods).optional(),
	deliveryConfig: z.record(z.string(), z.unknown()).optional(),
	isActive: z.boolean().optional(),
});

export type UpdateNotificationConfigInput = z.infer<
	typeof updateNotificationConfigSchema
>;
