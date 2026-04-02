const TOOLKIT_PREFIX = process.env.ARCADE_TOOLKIT_NAME ?? "YoutubeTools";

function t(name: string) {
	return `${TOOLKIT_PREFIX}.${name}`;
}

export const TOOL_NAMES = {
	// Owned channel tools (Google OAuth)
	GET_MY_CHANNEL: t("GetMyChannel"),
	LIST_CHANNEL_VIDEOS: t("ListChannelVideos"),
	DISCOVER_ALL_VIDEOS: t("DiscoverAllVideos"),
	GET_CHANNEL_ANALYTICS: t("GetChannelAnalytics"),
	GET_VIDEO_ANALYTICS: t("GetVideoAnalytics"),
	GET_MULTIPLE_VIDEO_ANALYTICS: t("GetMultipleVideoAnalytics"),
	GET_BATCH_VIDEO_COMPREHENSIVE_ANALYTICS: t(
		"GetBatchVideoComprehensiveAnalytics",
	),
	GET_BATCH_VIDEO_TRAFFIC_SOURCES: t("GetBatchVideoTrafficSources"),
	GET_BATCH_VIDEO_DEVICE_STATS: t("GetBatchVideoDeviceStats"),
	GET_BATCH_VIDEO_GEOGRAPHY_STATS: t("GetBatchVideoGeographyStats"),
	GET_VIDEO_RETENTION_CURVE: t("GetVideoRetentionCurve"),
	GET_LIVE_STREAM_TIMELINE: t("GetLiveStreamTimeline"),
	GET_CONTENT_TYPE_CLASSIFICATION: t("GetContentTypeClassification"),
	BACKFILL_VIDEO_ANALYTICS: t("BackfillVideoAnalytics"),
	BACKFILL_VIDEO_TRAFFIC_SOURCES: t("BackfillVideoTrafficSources"),
	BACKFILL_VIDEO_DEVICE_STATS: t("BackfillVideoDeviceStats"),
	BACKFILL_VIDEO_GEOGRAPHY_STATS: t("BackfillVideoGeographyStats"),

	// Public / tracked channel tools (API key)
	LIST_PUBLIC_CHANNEL_VIDEOS: t("ListPublicChannelVideos"),
	SCORE_CHANNEL: t("ScoreChannel"),
	SEARCH_CHANNELS: t("SearchChannels"),
	GET_PUBLIC_CHANNEL_INFO: t("GetPublicChannelInfo"),
	DISCOVER_ALL_PUBLIC_VIDEOS: t("DiscoverAllPublicVideos"),
	GET_PUBLIC_VIDEO_STATS: t("GetPublicVideoStats"),
	GET_PUBLIC_VIDEO_TRANSCRIPTION: t("GetPublicVideoTranscription"),
} as const;
