import { callTool, SLACK_TOOL_NAMES } from "@agentic-youtube-admin/arcade";
import {
	slackSendMessageResponseSchema,
	slackWhoAmIResponseSchema,
} from "@agentic-youtube-admin/arcade/schemas/slack";
import type { PrismaClient } from "@agentic-youtube-admin/db";

interface SlackDeliveryConfig {
	channelName?: string;
	dmToSelf?: boolean;
}

export class SlackDeliveryService {
	constructor(private prisma: PrismaClient) {}

	async send(
		userId: string,
		deliveryConfig: SlackDeliveryConfig,
		message: string,
	): Promise<{ ok: boolean; error?: string }> {
		const arcadeUserId = await this.resolveArcadeUserId(userId);
		if (!arcadeUserId) {
			return { ok: false, error: "Arcade account not linked" };
		}

		const inputs: Record<string, unknown> = { message };

		if (deliveryConfig.channelName) {
			inputs.channel_name = deliveryConfig.channelName;
		} else if (deliveryConfig.dmToSelf) {
			const whoAmI = await callTool(
				SLACK_TOOL_NAMES.WHO_AM_I,
				arcadeUserId,
				{},
				slackWhoAmIResponseSchema,
			);
			if (!whoAmI.ok) {
				return {
					ok: false,
					error: `Failed to resolve Slack user: ${whoAmI.error.message}`,
				};
			}
			inputs.user_ids = [whoAmI.data.user_id];
		} else {
			return { ok: false, error: "No Slack destination configured" };
		}

		const result = await callTool(
			SLACK_TOOL_NAMES.SEND_MESSAGE,
			arcadeUserId,
			inputs,
			slackSendMessageResponseSchema,
		);

		if (!result.ok) {
			return { ok: false, error: result.error.message };
		}

		return { ok: true };
	}

	private async resolveArcadeUserId(userId: string): Promise<string | null> {
		const account = await this.prisma.account.findFirst({
			where: { userId, providerId: "arcade" },
		});
		return account?.accountId ?? null;
	}
}
