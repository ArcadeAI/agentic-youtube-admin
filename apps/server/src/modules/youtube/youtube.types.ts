import { z } from "zod";

export const channelIdParamsSchema = z.object({
	channelId: z.string().min(1),
});

export type ChannelIdParams = z.infer<typeof channelIdParamsSchema>;

export const videoIdParamsSchema = z.object({
	videoId: z.string().min(1),
});

export type VideoIdParams = z.infer<typeof videoIdParamsSchema>;

export const dateRangeQuerySchema = z.object({
	startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

export const paginationQuerySchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const syncRequestSchema = z.object({
	arcadeUserId: z.string().min(1),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
});

export type SyncRequest = z.infer<typeof syncRequestSchema>;

export const connectChannelSchema = z.object({
	arcadeUserId: z.string().min(1),
});

export type ConnectChannelInput = z.infer<typeof connectChannelSchema>;
