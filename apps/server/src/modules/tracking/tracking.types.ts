import { z } from "zod";

// ── Channel routes ──────────────────────────────────────────────────────

export const searchChannelsBody = z.object({
	arcadeUserId: z.string(),
	query: z.string().min(1),
});

export const trackChannelBody = z.object({
	userId: z.string(),
	arcadeUserId: z.string(),
	channelIdOrHandle: z.string().min(1),
});

export const untrackChannelParams = z.object({
	id: z.string(),
});

export const pollChannelParams = z.object({
	id: z.string(),
});

export const pollChannelBody = z.object({
	userId: z.string(),
	arcadeUserId: z.string(),
});

export const listTrackedChannelsQuery = z.object({
	userId: z.string(),
});

export const channelSnapshotsParams = z.object({
	id: z.string(),
});

export const channelSnapshotsQuery = z.object({
	startDate: z.string().optional(),
	endDate: z.string().optional(),
});

export const channelScoresParams = z.object({
	id: z.string(),
});

export const channelScoresQuery = z.object({
	startDate: z.string().optional(),
	endDate: z.string().optional(),
});

export const channelVideosParams = z.object({
	id: z.string(),
});

export const discoverVideosBody = z.object({
	userId: z.string(),
	arcadeUserId: z.string(),
});

// ── Video routes ────────────────────────────────────────────────────────

export const videoSnapshotsParams = z.object({
	id: z.string(),
});

export const videoSnapshotsQuery = z.object({
	startDate: z.string().optional(),
	endDate: z.string().optional(),
});

// ── Brand routes ────────────────────────────────────────────────────────

export const listBrandsQuery = z.object({
	userId: z.string(),
});

export const createBrandBody = z.object({
	userId: z.string(),
	name: z.string().min(1),
	logoUrl: z.string().optional(),
	website: z.string().optional(),
	notes: z.string().optional(),
});

export const updateBrandParams = z.object({
	id: z.string(),
});

export const updateBrandBody = z.object({
	name: z.string().min(1).optional(),
	logoUrl: z.string().nullable().optional(),
	website: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
});

export const deleteBrandParams = z.object({
	id: z.string(),
});

// ── Sponsorship routes ──────────────────────────────────────────────────

export const listSponsoredVideosQuery = z.object({
	userId: z.string().optional(),
	brandId: z.string().optional(),
	videoId: z.string().optional(),
});

export const createSponsoredVideoBody = z.object({
	videoId: z.string(),
	brandId: z.string(),
	campaignName: z.string().optional(),
	paymentAmount: z.number().optional(),
	paymentCurrency: z.string().optional(),
	sponsorshipType: z.string().optional(),
	contractedAt: z.string().optional(),
	expectedReleaseAt: z.string().optional(),
	actualReleaseAt: z.string().optional(),
	deliverables: z.string().optional(),
	notes: z.string().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateSponsoredVideoParams = z.object({
	id: z.string(),
});

export const updateSponsoredVideoBody = z.object({
	campaignName: z.string().optional(),
	paymentAmount: z.number().nullable().optional(),
	paymentCurrency: z.string().optional(),
	sponsorshipType: z.string().nullable().optional(),
	contractedAt: z.string().nullable().optional(),
	expectedReleaseAt: z.string().nullable().optional(),
	actualReleaseAt: z.string().nullable().optional(),
	deliverables: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const deleteSponsoredVideoParams = z.object({
	id: z.string(),
});
