import { auth } from "@agentic-youtube-admin/auth";
import prisma from "@agentic-youtube-admin/db";
import { env } from "@agentic-youtube-admin/env/server";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { createMastraInstance } from "./mastra";
import { arcadeAuthRoutes } from "./modules/arcade-auth";
import { interactiveSessionRoutes } from "./modules/interactive-session";
import { createLibraryRoutes, LibraryService } from "./modules/library";
import {
	createNotificationRoutes,
	NotificationService,
} from "./modules/notification";
import { createScannerRoutes, ScannerService } from "./modules/scanner";
import {
	CronManager,
	createSchedulerRoutes,
	SchedulerService,
} from "./modules/scheduler";
import { TrackingService, trackingRoutes } from "./modules/tracking";
import { createYouTubeRoutes, YouTubeService } from "./modules/youtube";

// Initialize services
const youtubeService = new YouTubeService(prisma);
const trackingService = new TrackingService(prisma);
const schedulerService = new SchedulerService(prisma);
const notificationService = new NotificationService(prisma);
const scannerService = new ScannerService(prisma, schedulerService);
const libraryService = new LibraryService(prisma);

// Initialize Mastra workflows and connect to scanner
const mastra = createMastraInstance(youtubeService, trackingService, prisma);
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
			allowedHeaders: ["Content-Type", "Authorization", "X-Arcade-User-Id"],
			credentials: true,
		}),
	)
	.all("/api/auth/*", async (context) => {
		const { request, status } = context;
		if (["POST", "GET"].includes(request.method)) {
			return auth.handler(request);
		}
		return status(405);
	})
	// Module routes
	.use(arcadeAuthRoutes)
	.use(createYouTubeRoutes(youtubeService))
	.use(trackingRoutes)
	.use(createSchedulerRoutes(schedulerService))
	.use(createNotificationRoutes(notificationService))
	.use(createScannerRoutes(scannerService))
	.use(createLibraryRoutes(libraryService))
	.use(interactiveSessionRoutes)
	// Health check
	.get("/", () => "OK");

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
