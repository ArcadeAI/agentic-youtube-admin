import prisma from "@agentic-youtube-admin/db";
import { env } from "@agentic-youtube-admin/env/server";

export interface InteractiveAuthResult {
	userId: string;
	arcadeUserId: string;
}

export async function authenticateInteractive(
	request: Request,
): Promise<InteractiveAuthResult> {
	const authHeader = request.headers.get("authorization");
	const apiKey = authHeader?.replace("Bearer ", "");

	if (!apiKey || apiKey !== env.INTERACTIVE_API_KEY) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const arcadeUserId = request.headers.get("x-arcade-user-id");
	if (!arcadeUserId) {
		throw new Response("Missing X-Arcade-User-Id header", {
			status: 400,
		});
	}

	const user = await prisma.user.findFirst({
		where: {
			accounts: {
				some: { accountId: arcadeUserId, providerId: "arcade" },
			},
		},
	});

	if (!user) {
		throw new Response("User not found", { status: 403 });
	}

	return { userId: user.id, arcadeUserId };
}
