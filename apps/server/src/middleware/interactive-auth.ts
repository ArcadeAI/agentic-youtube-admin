import prisma from "@agentic-youtube-admin/db";

export interface InteractiveAuthResult {
	userId: string;
}

export async function authenticateInteractive(
	request: Request,
): Promise<InteractiveAuthResult> {
	const authHeader = request.headers.get("authorization");
	const token = authHeader?.replace("Bearer ", "");

	if (!token) {
		throw new Error("Missing Authorization header");
	}

	const accessToken = await prisma.oauthAccessToken.findUnique({
		where: { token },
		select: { userId: true, expiresAt: true, scopes: true },
	});

	if (!accessToken?.userId) {
		throw new Error("Invalid access token");
	}

	if (accessToken.expiresAt && accessToken.expiresAt < new Date()) {
		throw new Error("Access token expired");
	}

	if (!accessToken.scopes.includes("openid")) {
		throw new Error("Insufficient scope");
	}

	return { userId: accessToken.userId };
}
