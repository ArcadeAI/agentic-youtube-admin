import { env } from "@agentic-youtube-admin/env/web";
import { treaty } from "@elysiajs/eden";
import type { App } from "server";

export const api = treaty<App>(env.VITE_SERVER_URL);
