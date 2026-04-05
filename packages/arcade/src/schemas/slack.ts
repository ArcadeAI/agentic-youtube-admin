import { z } from "zod";

export const slackWhoAmIResponseSchema = z.object({
	user_id: z.string(),
	username: z.string().optional(),
	name: z.string().optional(),
	team_id: z.string().optional(),
	team_name: z.string().optional(),
});

export type SlackWhoAmIResponse = z.infer<typeof slackWhoAmIResponseSchema>;

export const slackSendMessageResponseSchema = z.object({
	ok: z.boolean().optional(),
	channel: z.string().optional(),
	ts: z.string().optional(),
});

export type SlackSendMessageResponse = z.infer<
	typeof slackSendMessageResponseSchema
>;

const slackConversationItemSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	is_channel: z.boolean().optional(),
	is_group: z.boolean().optional(),
	is_im: z.boolean().optional(),
	is_private: z.boolean().optional(),
	is_archived: z.boolean().optional(),
});

export type SlackConversationItem = z.infer<typeof slackConversationItemSchema>;

export const slackListConversationsResponseSchema = z.object({
	channels: z.array(slackConversationItemSchema),
	next_cursor: z.string().optional(),
});

export type SlackListConversationsResponse = z.infer<
	typeof slackListConversationsResponseSchema
>;
