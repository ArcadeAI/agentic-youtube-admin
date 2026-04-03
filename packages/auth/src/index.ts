import { createPrismaClient } from "@agentic-youtube-admin/db";
import { env } from "@agentic-youtube-admin/env/server";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { jwt, magicLink } from "better-auth/plugins";
import { Resend } from "resend";

const resend = new Resend(env.RESEND_API_KEY);

export function createAuth() {
	const prisma = createPrismaClient();

	return betterAuth({
		database: prismaAdapter(prisma, {
			provider: "postgresql",
		}),

		disabledPaths: ["/token"],
		trustedOrigins: [env.CORS_ORIGIN],
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
				httpOnly: true,
			},
		},
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: `${env.CORS_ORIGIN}/login`,
				consentPage: `${env.CORS_ORIGIN}/consent`,
				scopes: ["openid", "profile", "email", "offline_access"],
				accessTokenExpiresIn: 3600,
				refreshTokenExpiresIn: 2592000,
				allowDynamicClientRegistration: true,
			}),
			magicLink({
				sendMagicLink: async ({ email, url }) => {
					await resend.emails.send({
						from: env.RESEND_FROM_EMAIL,
						to: email,
						subject: "Sign in to YouTube Admin",
						html: `<p>Click the link below to sign in:</p><p><a href="${url}">Sign in</a></p><p>This link expires in 5 minutes.</p>`,
					});
				},
			}),
			passkey({
				rpID: env.PASSKEY_RP_ID,
				rpName: "YouTube Admin",
				origin: env.BETTER_AUTH_URL,
			}),
		],
	});
}

export const auth = createAuth();
