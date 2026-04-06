import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		ARCADE_API_KEY: z.string().min(1),
		INTERACTIVE_API_KEY: z.string().min(1).optional(),
		YOUTUBE_API_KEY: z.string().min(1).optional(),
		OPENAI_API_KEY: z.string().min(1).optional(),
		YT_PROXY_URL: z.string().min(1),
		YT_PROXY_SECRET: z.string().min(1).optional(),
		RESEND_API_KEY: z.string().min(1),
		PASSKEY_RP_ID: z.string().min(1),
		RESEND_FROM_EMAIL: z.string().default("noreply@yourdomain.com"),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
