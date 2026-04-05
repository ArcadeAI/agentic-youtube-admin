import {
	callTool,
	checkToolAuth,
	SLACK_TOOL_NAMES,
	waitAndExecuteTool,
} from "@agentic-youtube-admin/arcade";
import {
	slackListConversationsResponseSchema,
	slackWhoAmIResponseSchema,
} from "@agentic-youtube-admin/arcade/schemas/slack";
import { auth } from "@agentic-youtube-admin/auth";
import prisma from "@agentic-youtube-admin/db";
import { Elysia, t } from "elysia";

async function resolveArcadeUserId(userId: string): Promise<string | null> {
	const account = await prisma.account.findFirst({
		where: { userId, providerId: "arcade" },
	});
	return account?.accountId ?? null;
}

export function createSlackAuthRoutes() {
	return new Elysia({ prefix: "/api/slack" })
		.get("/status", async ({ request }) => {
			const session = await auth.api.getSession({
				headers: request.headers,
			});
			if (!session?.user) {
				return new Response("Unauthorized", { status: 401 });
			}

			const arcadeUserId = await resolveArcadeUserId(session.user.id);
			if (!arcadeUserId) {
				return { connected: false, reason: "arcade_not_linked" };
			}

			const authCheck = await checkToolAuth(
				SLACK_TOOL_NAMES.SEND_MESSAGE,
				arcadeUserId,
			);
			return { connected: !authCheck.needsAuth };
		})
		.post("/connect", async ({ request }) => {
			const session = await auth.api.getSession({
				headers: request.headers,
			});
			if (!session?.user) {
				return new Response("Unauthorized", { status: 401 });
			}

			const arcadeUserId = await resolveArcadeUserId(session.user.id);
			if (!arcadeUserId) {
				return new Response(
					"Arcade account not linked. Connect Arcade first.",
					{ status: 400 },
				);
			}

			const authCheck = await checkToolAuth(
				SLACK_TOOL_NAMES.SEND_MESSAGE,
				arcadeUserId,
			);

			if (authCheck.needsAuth) {
				return {
					needsAuth: true,
					authUrl: authCheck.authUrl,
					authId: authCheck.authId,
				};
			}

			return { connected: true };
		})
		.post(
			"/complete-connection",
			async ({ request, body }) => {
				const session = await auth.api.getSession({
					headers: request.headers,
				});
				if (!session?.user) {
					return new Response("Unauthorized", { status: 401 });
				}

				const arcadeUserId = await resolveArcadeUserId(session.user.id);
				if (!arcadeUserId) {
					return new Response("Arcade account not linked", { status: 400 });
				}

				const result = await waitAndExecuteTool(
					body.authId,
					SLACK_TOOL_NAMES.WHO_AM_I,
					arcadeUserId,
					{},
					slackWhoAmIResponseSchema,
				);

				if (!result.ok) {
					return new Response(
						`Slack connection failed: ${result.error.message}`,
						{
							status: 500,
						},
					);
				}

				return {
					connected: true,
					user: result.data,
				};
			},
			{
				body: t.Object({ authId: t.String() }),
			},
		)
		.get("/channels", async ({ request }) => {
			const session = await auth.api.getSession({
				headers: request.headers,
			});
			if (!session?.user) {
				return new Response("Unauthorized", { status: 401 });
			}

			const arcadeUserId = await resolveArcadeUserId(session.user.id);
			if (!arcadeUserId) {
				return new Response("Arcade account not linked", { status: 400 });
			}

			const result = await callTool(
				SLACK_TOOL_NAMES.LIST_CONVERSATIONS,
				arcadeUserId,
				{
					conversation_types: "public_channel,private_channel",
					limit: 200,
				},
				slackListConversationsResponseSchema,
			);

			if (!result.ok) {
				return new Response(
					`Failed to list Slack channels: ${result.error.message}`,
					{ status: 500 },
				);
			}

			const channels = result.data.channels
				.filter((c) => !c.is_archived)
				.map((c) => ({
					id: c.id,
					name: c.name,
					isPrivate: c.is_private ?? false,
				}));

			return { channels };
		});
}
