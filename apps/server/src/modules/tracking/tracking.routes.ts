import prisma from "@agentic-youtube-admin/db";
import { Elysia, t } from "elysia";
import { TrackingService } from "./tracking.service";

const service = new TrackingService(prisma);

export const trackingRoutes = new Elysia({ prefix: "/api/tracking" })

	// ── Tracked Channels ──────────────────────────────────────────────────

	.get(
		"/channels",
		async ({ query }) => {
			return prisma.trackedChannel.findMany({
				where: { userId: query.userId, isActive: true },
				orderBy: { createdAt: "desc" },
			});
		},
		{
			query: t.Object({
				userId: t.String(),
			}),
		},
	)

	.post(
		"/channels/search",
		async ({ body }) => {
			return service.searchChannels(body.arcadeUserId, body.query);
		},
		{
			body: t.Object({
				arcadeUserId: t.String(),
				query: t.String({ minLength: 1 }),
			}),
		},
	)

	.post(
		"/channels/track",
		async ({ body }) => {
			return service.trackChannel(
				body.userId,
				body.arcadeUserId,
				body.channelIdOrHandle,
			);
		},
		{
			body: t.Object({
				userId: t.String(),
				arcadeUserId: t.String(),
				channelIdOrHandle: t.String({ minLength: 1 }),
			}),
		},
	)

	.delete(
		"/channels/:id",
		async ({ params, query }) => {
			await service.untrackChannel(query.userId, params.id);
			return { success: true };
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			query: t.Object({
				userId: t.String(),
			}),
		},
	)

	.post(
		"/channels/:id/poll",
		async ({ params, body }) => {
			return service.pollChannel(body.userId, body.arcadeUserId, params.id);
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				userId: t.String(),
				arcadeUserId: t.String(),
			}),
		},
	)

	.get(
		"/channels/:id/snapshots",
		async ({ params, query }) => {
			const where: Record<string, unknown> = { channelId: params.id };
			if (query.startDate || query.endDate) {
				const dateFilter: Record<string, Date> = {};
				if (query.startDate) dateFilter.gte = new Date(query.startDate);
				if (query.endDate) dateFilter.lte = new Date(query.endDate);
				where.date = dateFilter;
			}
			return prisma.trackedChannelSnapshot.findMany({
				where,
				orderBy: { date: "asc" },
			});
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			query: t.Object({
				startDate: t.Optional(t.String()),
				endDate: t.Optional(t.String()),
			}),
		},
	)

	.get(
		"/channels/:id/scores",
		async ({ params, query }) => {
			const where: Record<string, unknown> = { channelId: params.id };
			if (query.startDate || query.endDate) {
				const dateFilter: Record<string, Date> = {};
				if (query.startDate) dateFilter.gte = new Date(query.startDate);
				if (query.endDate) dateFilter.lte = new Date(query.endDate);
				where.date = dateFilter;
			}
			return prisma.channelEngagementScore.findMany({
				where,
				orderBy: { date: "asc" },
			});
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			query: t.Object({
				startDate: t.Optional(t.String()),
				endDate: t.Optional(t.String()),
			}),
		},
	)

	.get(
		"/channels/:id/videos",
		async ({ params }) => {
			return prisma.trackedVideo.findMany({
				where: { channelId: params.id },
				orderBy: { publishedAt: "desc" },
			});
		},
		{
			params: t.Object({
				id: t.String(),
			}),
		},
	)

	.post(
		"/channels/:id/discover",
		async ({ params, body }) => {
			return service.discoverTrackedVideos(
				body.userId,
				body.arcadeUserId,
				params.id,
			);
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				userId: t.String(),
				arcadeUserId: t.String(),
			}),
		},
	)

	// ── Video Snapshots ──────────────────────────────────────────────────

	.get(
		"/videos/:id/snapshots",
		async ({ params, query }) => {
			const where: Record<string, unknown> = { videoId: params.id };
			if (query.startDate || query.endDate) {
				const dateFilter: Record<string, Date> = {};
				if (query.startDate) dateFilter.gte = new Date(query.startDate);
				if (query.endDate) dateFilter.lte = new Date(query.endDate);
				where.date = dateFilter;
			}
			return prisma.trackedVideoSnapshot.findMany({
				where,
				orderBy: { date: "asc" },
			});
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			query: t.Object({
				startDate: t.Optional(t.String()),
				endDate: t.Optional(t.String()),
			}),
		},
	)

	// ── Brands ────────────────────────────────────────────────────────────

	.get(
		"/brands",
		async ({ query }) => {
			return service.listBrands(query.userId);
		},
		{
			query: t.Object({
				userId: t.String(),
			}),
		},
	)

	.post(
		"/brands",
		async ({ body }) => {
			return service.createBrand(body);
		},
		{
			body: t.Object({
				userId: t.String(),
				name: t.String({ minLength: 1 }),
				logoUrl: t.Optional(t.String()),
				website: t.Optional(t.String()),
				notes: t.Optional(t.String()),
			}),
		},
	)

	.patch(
		"/brands/:id",
		async ({ params, body }) => {
			return service.updateBrand(params.id, body);
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1 })),
				logoUrl: t.Optional(t.Nullable(t.String())),
				website: t.Optional(t.Nullable(t.String())),
				notes: t.Optional(t.Nullable(t.String())),
			}),
		},
	)

	.delete(
		"/brands/:id",
		async ({ params }) => {
			await service.deleteBrand(params.id);
			return { success: true };
		},
		{
			params: t.Object({
				id: t.String(),
			}),
		},
	)

	// ── Sponsorships ─────────────────────────────────────────────────────

	.get(
		"/sponsorships",
		async ({ query }) => {
			return service.listSponsoredVideos(query);
		},
		{
			query: t.Object({
				userId: t.Optional(t.String()),
				brandId: t.Optional(t.String()),
				videoId: t.Optional(t.String()),
			}),
		},
	)

	.post(
		"/sponsorships",
		async ({ body }) => {
			return service.createSponsoredVideo(body);
		},
		{
			body: t.Object({
				videoId: t.String(),
				brandId: t.String(),
				campaignName: t.Optional(t.String()),
				paymentAmount: t.Optional(t.Number()),
				paymentCurrency: t.Optional(t.String()),
				sponsorshipType: t.Optional(t.String()),
				contractedAt: t.Optional(t.String()),
				expectedReleaseAt: t.Optional(t.String()),
				actualReleaseAt: t.Optional(t.String()),
				deliverables: t.Optional(t.String()),
				notes: t.Optional(t.String()),
				metadata: t.Optional(t.Record(t.String(), t.Unknown())),
			}),
		},
	)

	.patch(
		"/sponsorships/:id",
		async ({ params, body }) => {
			return service.updateSponsoredVideo(params.id, body);
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				campaignName: t.Optional(t.String()),
				paymentAmount: t.Optional(t.Nullable(t.Number())),
				paymentCurrency: t.Optional(t.String()),
				sponsorshipType: t.Optional(t.Nullable(t.String())),
				contractedAt: t.Optional(t.Nullable(t.String())),
				expectedReleaseAt: t.Optional(t.Nullable(t.String())),
				actualReleaseAt: t.Optional(t.Nullable(t.String())),
				deliverables: t.Optional(t.Nullable(t.String())),
				notes: t.Optional(t.Nullable(t.String())),
				metadata: t.Optional(t.Nullable(t.Record(t.String(), t.Unknown()))),
			}),
		},
	)

	.delete(
		"/sponsorships/:id",
		async ({ params }) => {
			await service.deleteSponsoredVideo(params.id);
			return { success: true };
		},
		{
			params: t.Object({
				id: t.String(),
			}),
		},
	);
