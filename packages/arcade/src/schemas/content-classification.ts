import { z } from "zod";

const contentClassificationItemSchema = z.object({
	contentType: z.string(),
	width: z.number().nullable().optional(),
	height: z.number().nullable().optional(),
	aspectRatio: z.number().nullable().optional(),
	duration: z.number().nullable().optional(),
});

export type ContentClassificationItem = z.infer<
	typeof contentClassificationItemSchema
>;

export const getContentTypeClassificationResponseSchema = z.record(
	z.string(),
	contentClassificationItemSchema,
);

export type GetContentTypeClassificationResponse = z.infer<
	typeof getContentTypeClassificationResponseSchema
>;
