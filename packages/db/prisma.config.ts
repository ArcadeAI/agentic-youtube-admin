import path from "node:path";

import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

dotenv.config({
	path: "../../apps/server/.env",
});

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
	schema: path.join("prisma", "schema"),
	migrations: {
		path: path.join("prisma", "migrations"),
	},
	datasource: databaseUrl ? { url: env("DATABASE_URL") } : undefined,
});
