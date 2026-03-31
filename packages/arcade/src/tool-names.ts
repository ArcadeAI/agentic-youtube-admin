export const TOOL_NAMES = {
	// Owned channel tools (Google OAuth)
	GET_MY_CHANNEL: "YtMetrics.GetMyChannel",
	LIST_CHANNEL_VIDEOS: "YtMetrics.ListChannelVideos",
	DISCOVER_ALL_VIDEOS: "YtMetrics.DiscoverAllVideos",
	GET_CHANNEL_ANALYTICS: "YtMetrics.GetChannelAnalytics",
	GET_VIDEO_ANALYTICS: "YtMetrics.GetVideoAnalytics",
	GET_MULTIPLE_VIDEO_ANALYTICS: "YtMetrics.GetMultipleVideoAnalytics",
	GET_BATCH_VIDEO_COMPREHENSIVE_ANALYTICS:
		"YtMetrics.GetBatchVideoComprehensiveAnalytics",
	GET_BATCH_VIDEO_TRAFFIC_SOURCES: "YtMetrics.GetBatchVideoTrafficSources",
	GET_BATCH_VIDEO_DEVICE_STATS: "YtMetrics.GetBatchVideoDeviceStats",
	GET_BATCH_VIDEO_GEOGRAPHY_STATS: "YtMetrics.GetBatchVideoGeographyStats",
	GET_VIDEO_RETENTION_CURVE: "YtMetrics.GetVideoRetentionCurve",
	GET_LIVE_STREAM_TIMELINE: "YtMetrics.GetLiveStreamTimeline",
	GET_CONTENT_TYPE_CLASSIFICATION: "YtMetrics.GetContentTypeClassification",
	BACKFILL_VIDEO_ANALYTICS: "YtMetrics.BackfillVideoAnalytics",
	BACKFILL_VIDEO_TRAFFIC_SOURCES: "YtMetrics.BackfillVideoTrafficSources",
	BACKFILL_VIDEO_DEVICE_STATS: "YtMetrics.BackfillVideoDeviceStats",
	BACKFILL_VIDEO_GEOGRAPHY_STATS: "YtMetrics.BackfillVideoGeographyStats",

	// Public / tracked channel tools (API key)
	LIST_PUBLIC_CHANNEL_VIDEOS: "YtMetrics.ListPublicChannelVideos",
	SCORE_CHANNEL: "YtMetrics.ScoreChannel",
	SEARCH_CHANNELS: "YtMetrics.SearchChannels",
	GET_PUBLIC_CHANNEL_INFO: "YtMetrics.GetPublicChannelInfo",
	DISCOVER_ALL_PUBLIC_VIDEOS: "YtMetrics.DiscoverAllPublicVideos",
	GET_PUBLIC_VIDEO_STATS: "YtMetrics.GetPublicVideoStats",
	GET_PUBLIC_VIDEO_TRANSCRIPTION: "YtMetrics.GetPublicVideoTranscription",
} as const;
