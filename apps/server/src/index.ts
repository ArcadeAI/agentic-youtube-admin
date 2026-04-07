import { auth } from "@agentic-youtube-admin/auth";
import prisma from "@agentic-youtube-admin/db";
import { env } from "@agentic-youtube-admin/env/server";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { createMastraInstance } from "./mastra";
import { arcadeAuthRoutes } from "./modules/arcade-auth";
import { createInteractiveSessionRoutes } from "./modules/interactive-session";
import {
	createLibraryRoutes,
	LibraryService,
	TranscriptionService,
} from "./modules/library";
import {
	createNotificationRoutes,
	createSlackAuthRoutes,
	NotificationService,
	SlackDeliveryService,
} from "./modules/notification";
import { createScannerRoutes, ScannerService } from "./modules/scanner";
import {
	CronManager,
	createSchedulerRoutes,
	SchedulerService,
} from "./modules/scheduler";
import { TrackingService, trackingRoutes } from "./modules/tracking";
import { createYouTubeRoutes, YouTubeService } from "./modules/youtube";

// Enable JSON serialization of BigInt values returned by Prisma
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
	return Number(this);
};

// Initialize services
const youtubeService = new YouTubeService(prisma);
const trackingService = new TrackingService(prisma);
const schedulerService = new SchedulerService(prisma);
const notificationService = new NotificationService(prisma);
const slackDeliveryService = new SlackDeliveryService(prisma);
const scannerService = new ScannerService(
	prisma,
	schedulerService,
	notificationService,
	slackDeliveryService,
);
const libraryService = new LibraryService();
const transcriptionService = new TranscriptionService(
	libraryService,
	env.YT_PROXY_URL,
	env.YT_PROXY_SECRET ?? "",
);

// Initialize Mastra workflows and connect to scanner
const mastra = createMastraInstance(
	youtubeService,
	trackingService,
	prisma,
	transcriptionService,
);
scannerService.setMastra(mastra);

// Initialize cron manager
const cronManager = new CronManager(
	schedulerService,
	async (scheduleId, scanType, userId, channelId, config) => {
		await scannerService.handleScheduledScan(
			scheduleId,
			scanType,
			userId,
			channelId,
			config,
		);
	},
);

const app = new Elysia()
	.use(
		cors({
			origin: env.CORS_ORIGIN,
			methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		}),
	)
	// #region agent log
	.onRequest(({ request }) => {
		console.log(
			`[debug-813928] onRequest method=${request.method} url=${request.url}`,
		);
	})
	// #endregion
	.all("/api/auth/*", async (context) => {
		const { request, status } = context;
		if (["POST", "GET"].includes(request.method)) {
			return auth.handler(request);
		}
		return status(405);
	})
	// well-known discovery endpoints for OAuth/OIDC (oauthProvider plugin)
	.all("/.well-known/*", async ({ request }) => auth.handler(request))
	// Module routes
	.use(arcadeAuthRoutes)
	.use(createSlackAuthRoutes())
	.use(createYouTubeRoutes(youtubeService))
	.use(trackingRoutes)
	.use(createSchedulerRoutes(schedulerService, cronManager))
	.use(createNotificationRoutes(notificationService))
	.use(createScannerRoutes(scannerService))
	.use(createLibraryRoutes(libraryService, prisma))
	.use(createInteractiveSessionRoutes(scannerService, libraryService))
	// Health check
	.get("/", () => {
		// #region agent log
		console.log("[debug-813928] GET / handler fired → returning OK");
		// #endregion
		return "OK";
	});

export type App = typeof app;

// Start server and load cron schedules
app.listen(3000, async () => {
	console.log("Server is running on http://localhost:3000");
	try {
		await cronManager.loadFromDb();
	} catch (err) {
		console.error("Failed to load cron schedules:", err);
	}
});
