import { env } from "@agentic-youtube-admin/env/server";
import { verifyAccessToken } from "better-auth/oauth2";

export interface InteractiveAuthResult {
	userId: string;
}

export async function authenticateInteractive(
	request: Request,
): Promise<InteractiveAuthResult> {
	const authHeader = request.headers.get("authorization");
	const token = authHeader?.replace("Bearer ", "");

	if (!token) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const payload = await verifyAccessToken(token, {
		verifyOptions: {
			issuer: `${env.BETTER_AUTH_URL}/api/auth`,
			audience: env.BETTER_AUTH_URL,
		},
		scopes: ["openid"],
	});

	if (!payload.sub) {
		throw new Response("Invalid token: missing sub claim", { status: 401 });
	}

	return { userId: payload.sub };
}
