import { z } from "zod";

// Slack.WhoAmI
export const slackWhoAmIResponseSchema = z.object({
	user_id: z.string(),
	username: z.string().optional(),
	display_name: z.string().optional(),
	real_name: z.string().optional(),
	first_name: z.string().optional(),
	last_name: z.string().optional(),
	email: z.string().optional(),
	profile_picture_url: z.string().optional(),
	slack_access: z.boolean().optional(),
});

export type SlackWhoAmIResponse = z.infer<typeof slackWhoAmIResponseSchema>;

// Slack.SendMessage
export const slackSendMessageResponseSchema = z.object({
	ok: z.boolean().optional(),
	channel: z.string().optional(),
	ts: z.string().optional(),
});

export type SlackSendMessageResponse = z.infer<
	typeof slackSendMessageResponseSchema
>;

// Slack.ListConversations
const slackConversationItemSchema = z.object({
	id: z.string(),
	name: z.string().nullable().optional(),
	conversation_type: z.string().optional(),
	is_archived: z.boolean().optional(),
	is_member: z.boolean().optional(),
	is_private: z.boolean().optional(),
	num_members: z.number().optional(),
	purpose: z.string().optional(),
	user: z.string().optional(),
	is_user_deleted: z.boolean().nullable().optional(),
});

export type SlackConversationItem = z.infer<typeof slackConversationItemSchema>;

export const slackListConversationsResponseSchema = z.object({
	conversations: z.array(slackConversationItemSchema),
	next_cursor: z.string().optional(),
});

export type SlackListConversationsResponse = z.infer<
	typeof slackListConversationsResponseSchema
>;
