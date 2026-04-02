import { getArcadeClient } from "@agentic-youtube-admin/arcade";
import { auth } from "@agentic-youtube-admin/auth";
import prisma from "@agentic-youtube-admin/db";
import { env } from "@agentic-youtube-admin/env/server";
import { Elysia, t } from "elysia";
import { YouTubeService } from "../youtube/youtube.service";

const youtubeService = new YouTubeService(prisma);

export const arcadeAuthRoutes = new Elysia({ prefix: "/api/arcade" }).get(
	"/verify",
	async ({ query, request }) => {
		const flowId = query.flow_id;
		if (!flowId) {
			return new Response("Missing flow_id", { status: 400 });
		}

		// Get current user from Better Auth session cookie
		const session = await auth.api.getSession({
			headers: request.headers,
		});

		if (!session?.user) {
			// User not logged in — redirect to login with return URL
			const returnUrl = encodeURIComponent(
				`${env.BETTER_AUTH_URL}/api/arcade/verify?flow_id=${flowId}`,
			);
			return Response.redirect(
				`${env.CORS_ORIGIN}/login?return_to=${returnUrl}`,
				302,
			);
		}

		// Confirm user identity with Arcade
		const arcade = getArcadeClient();
		try {
			await arcade.auth.confirmUser({
				flow_id: flowId,
				user_id: session.user.email,
			});
		} catch (err) {
			console.error("Arcade user verification failed:", err);
			return Response.redirect(
				`${env.CORS_ORIGIN}/dashboard?youtube=error`,
				302,
			);
		}

		// Create Account record linking Arcade identity to local user
		const arcadeUserId = session.user.email;
		const existing = await prisma.account.findFirst({
			where: { userId: session.user.id, providerId: "arcade" },
		});
		if (!existing) {
			await prisma.account.create({
				data: {
					id: crypto.randomUUID(),
					accountId: arcadeUserId,
					providerId: "arcade",
					userId: session.user.id,
				},
			});
		}

		// Sync channel data (best-effort — user can retry from dashboard)
		try {
			await youtubeService.connectChannel(session.user.id, arcadeUserId);
		} catch (err) {
			console.error("Channel sync after OAuth failed:", err);
		}

		// Success — redirect to dashboard
		return Response.redirect(
			`${env.CORS_ORIGIN}/dashboard?youtube=connected`,
			302,
		);
	},
	{
		query: t.Object({
			flow_id: t.Optional(t.String()),
		}),
	},
);
