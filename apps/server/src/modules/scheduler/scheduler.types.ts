import { z } from "zod";

export const scanTypes = [
	"owned_backfill",
	"owned_daily_sync",
	"tracked_daily_poll",
	"track_new_channel",
	"transcription",
] as const;

export type ScanType = (typeof scanTypes)[number];

export const createScheduleSchema = z.object({
	scanType: z.enum(scanTypes),
	channelId: z.string().optional(),
	cronExpression: z.string().min(1),
	config: z.record(z.string(), z.unknown()).optional(),
	notificationConfigId: z.string().optional(),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

export const updateScheduleSchema = z.object({
	cronExpression: z.string().min(1).optional(),
	isActive: z.boolean().optional(),
	config: z.record(z.string(), z.unknown()).optional(),
	notificationConfigId: z.string().nullable().optional(),
});

export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
