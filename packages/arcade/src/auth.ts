import { getArcadeClient } from "./client";
import { AuthRequiredError } from "./errors";

export type AuthStatus =
	| { authorized: true }
	| { authorized: false; authUrl: string };

export async function checkAuthStatus(authId: string): Promise<AuthStatus> {
	const client = getArcadeClient();

	try {
		const status = await client.auth.status({ id: authId });
		if (status.status === "completed") {
			return { authorized: true };
		}
		return {
			authorized: false,
			authUrl: status.url ?? "unknown",
		};
	} catch {
		return { authorized: false, authUrl: "unknown" };
	}
}

export async function startAuthFlow(userId: string): Promise<string> {
	const client = getArcadeClient();

	const auth = await client.auth.start(userId, "google", {
		scopes: [
			"https://www.googleapis.com/auth/youtube.readonly",
			"https://www.googleapis.com/auth/yt-analytics.readonly",
		],
	});

	if (!auth.url) {
		throw new AuthRequiredError("unknown");
	}

	return auth.url;
}
