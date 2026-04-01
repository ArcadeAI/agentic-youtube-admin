-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_config" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT,
    "notificationType" TEXT NOT NULL,
    "conditions" JSONB,
    "deliveryMethod" TEXT NOT NULL,
    "deliveryConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_schedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scanType" TEXT NOT NULL,
    "channelId" TEXT,
    "cronExpression" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunError" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_run" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "scanType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "result" JSONB,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsored_video" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL DEFAULT '',
    "paymentAmount" DOUBLE PRECISION,
    "paymentCurrency" TEXT NOT NULL DEFAULT 'USD',
    "sponsorshipType" TEXT,
    "contractedAt" TIMESTAMP(3),
    "expectedReleaseAt" TIMESTAMP(3),
    "actualReleaseAt" TIMESTAMP(3),
    "deliverables" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsored_video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_channel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "channelThumbnail" TEXT,
    "customUrl" TEXT,
    "description" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastPolledAt" TIMESTAMP(3),
    "lastPollError" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracked_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_channel_snapshot" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "subscriberCount" INTEGER,
    "totalViews" BIGINT NOT NULL,
    "videoCount" INTEGER NOT NULL,
    "subscriberCountHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracked_channel_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_video" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER,
    "tags" TEXT[],
    "categoryId" TEXT,
    "liveBroadcastContent" TEXT,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracked_video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_video_snapshot" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "viewCount" BIGINT NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "viewsDelta" BIGINT,
    "likesDelta" INTEGER,
    "commentsDelta" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracked_video_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_engagement_score" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "scoreNormalized" DOUBLE PRECISION,
    "formulaVersion" TEXT NOT NULL,
    "formulaName" TEXT,
    "inputData" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_engagement_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_channel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "channelThumbnail" TEXT,
    "customUrl" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "backfillCompleted" BOOLEAN NOT NULL DEFAULT false,
    "backfillStartDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER,
    "tags" TEXT[],
    "categoryId" TEXT,
    "liveBroadcastContent" TEXT,
    "contentType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "aspectRatio" DOUBLE PRECISION,
    "currentViews" BIGINT NOT NULL DEFAULT 0,
    "currentLikes" INTEGER NOT NULL DEFAULT 0,
    "currentComments" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_daily_stats" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" BIGINT NOT NULL DEFAULT 0,
    "estimatedMinutesWatched" BIGINT,
    "averageViewDuration" INTEGER,
    "averageViewPercentage" DOUBLE PRECISION,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "videosAddedToPlaylists" INTEGER,
    "videosRemovedFromPlaylists" INTEGER,
    "subscribersGained" INTEGER,
    "subscribersLost" INTEGER,
    "engagedViews" BIGINT,
    "redViews" BIGINT,
    "estimatedRedMinutesWatched" BIGINT,
    "cardImpressions" BIGINT,
    "cardClicks" BIGINT,
    "cardClickRate" DOUBLE PRECISION,
    "cardTeaserImpressions" BIGINT,
    "cardTeaserClicks" BIGINT,
    "cardTeaserClickRate" DOUBLE PRECISION,
    "averageConcurrentViewers" INTEGER,
    "peakConcurrentViewers" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_traffic_source_stats" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "trafficSourceType" TEXT NOT NULL,
    "trafficSourceDetail" TEXT NOT NULL DEFAULT '',
    "views" BIGINT NOT NULL DEFAULT 0,
    "estimatedMinutesWatched" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_traffic_source_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_device_stats" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "deviceType" TEXT NOT NULL,
    "operatingSystem" TEXT NOT NULL DEFAULT '',
    "views" BIGINT NOT NULL DEFAULT 0,
    "estimatedMinutesWatched" BIGINT,
    "averageViewDuration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_device_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_geography_stats" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "country" TEXT NOT NULL,
    "views" BIGINT NOT NULL DEFAULT 0,
    "estimatedMinutesWatched" BIGINT,
    "subscribersGained" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_geography_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_retention" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "elapsedRatio" DOUBLE PRECISION NOT NULL,
    "audienceWatchRatio" DOUBLE PRECISION NOT NULL,
    "relativeRetentionPerformance" DOUBLE PRECISION,
    "calculatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_retention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_stream_timeline" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "livestreamPosition" INTEGER NOT NULL,
    "averageConcurrentViewers" INTEGER,
    "peakConcurrentViewers" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_stream_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_daily_stats" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "subscriberCount" INTEGER,
    "totalViews" BIGINT NOT NULL,
    "totalVideos" INTEGER NOT NULL,
    "subscribersGained" INTEGER,
    "subscribersLost" INTEGER,
    "viewsGained" BIGINT,
    "estimatedMinutesWatched" BIGINT,
    "averageViewDuration" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "notification_config_userId_idx" ON "notification_config"("userId");

-- CreateIndex
CREATE INDEX "notification_config_notificationType_idx" ON "notification_config"("notificationType");

-- CreateIndex
CREATE INDEX "scan_schedule_userId_idx" ON "scan_schedule"("userId");

-- CreateIndex
CREATE INDEX "scan_schedule_scanType_idx" ON "scan_schedule"("scanType");

-- CreateIndex
CREATE INDEX "scan_run_scheduleId_idx" ON "scan_run"("scheduleId");

-- CreateIndex
CREATE INDEX "scan_run_status_idx" ON "scan_run"("status");

-- CreateIndex
CREATE INDEX "brand_userId_idx" ON "brand"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "brand_userId_name_key" ON "brand"("userId", "name");

-- CreateIndex
CREATE INDEX "sponsored_video_videoId_idx" ON "sponsored_video"("videoId");

-- CreateIndex
CREATE INDEX "sponsored_video_brandId_idx" ON "sponsored_video"("brandId");

-- CreateIndex
CREATE INDEX "sponsored_video_campaignName_idx" ON "sponsored_video"("campaignName");

-- CreateIndex
CREATE UNIQUE INDEX "sponsored_video_videoId_brandId_campaignName_key" ON "sponsored_video"("videoId", "brandId", "campaignName");

-- CreateIndex
CREATE INDEX "tracked_channel_userId_idx" ON "tracked_channel"("userId");

-- CreateIndex
CREATE INDEX "tracked_channel_channelId_idx" ON "tracked_channel"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_channel_userId_channelId_key" ON "tracked_channel"("userId", "channelId");

-- CreateIndex
CREATE INDEX "tracked_channel_snapshot_channelId_date_idx" ON "tracked_channel_snapshot"("channelId", "date");

-- CreateIndex
CREATE INDEX "tracked_channel_snapshot_date_idx" ON "tracked_channel_snapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_channel_snapshot_channelId_date_key" ON "tracked_channel_snapshot"("channelId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_video_videoId_key" ON "tracked_video"("videoId");

-- CreateIndex
CREATE INDEX "tracked_video_channelId_idx" ON "tracked_video"("channelId");

-- CreateIndex
CREATE INDEX "tracked_video_publishedAt_idx" ON "tracked_video"("publishedAt");

-- CreateIndex
CREATE INDEX "tracked_video_contentType_idx" ON "tracked_video"("contentType");

-- CreateIndex
CREATE INDEX "tracked_video_snapshot_videoId_date_idx" ON "tracked_video_snapshot"("videoId", "date");

-- CreateIndex
CREATE INDEX "tracked_video_snapshot_date_idx" ON "tracked_video_snapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_video_snapshot_videoId_date_key" ON "tracked_video_snapshot"("videoId", "date");

-- CreateIndex
CREATE INDEX "channel_engagement_score_channelId_date_idx" ON "channel_engagement_score"("channelId", "date");

-- CreateIndex
CREATE INDEX "channel_engagement_score_channelId_periodType_idx" ON "channel_engagement_score"("channelId", "periodType");

-- CreateIndex
CREATE INDEX "channel_engagement_score_formulaVersion_idx" ON "channel_engagement_score"("formulaVersion");

-- CreateIndex
CREATE UNIQUE INDEX "channel_engagement_score_channelId_date_periodType_formulaV_key" ON "channel_engagement_score"("channelId", "date", "periodType", "formulaVersion");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_channel_channelId_key" ON "youtube_channel"("channelId");

-- CreateIndex
CREATE INDEX "youtube_channel_userId_idx" ON "youtube_channel"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "video_videoId_key" ON "video"("videoId");

-- CreateIndex
CREATE INDEX "video_channelId_idx" ON "video"("channelId");

-- CreateIndex
CREATE INDEX "video_publishedAt_idx" ON "video"("publishedAt");

-- CreateIndex
CREATE INDEX "video_contentType_idx" ON "video"("contentType");

-- CreateIndex
CREATE INDEX "video_daily_stats_videoId_date_idx" ON "video_daily_stats"("videoId", "date");

-- CreateIndex
CREATE INDEX "video_daily_stats_date_idx" ON "video_daily_stats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "video_daily_stats_videoId_date_key" ON "video_daily_stats"("videoId", "date");

-- CreateIndex
CREATE INDEX "video_traffic_source_stats_videoId_date_idx" ON "video_traffic_source_stats"("videoId", "date");

-- CreateIndex
CREATE INDEX "video_traffic_source_stats_trafficSourceType_idx" ON "video_traffic_source_stats"("trafficSourceType");

-- CreateIndex
CREATE UNIQUE INDEX "video_traffic_source_stats_videoId_date_trafficSourceType_t_key" ON "video_traffic_source_stats"("videoId", "date", "trafficSourceType", "trafficSourceDetail");

-- CreateIndex
CREATE INDEX "video_device_stats_videoId_date_idx" ON "video_device_stats"("videoId", "date");

-- CreateIndex
CREATE INDEX "video_device_stats_deviceType_idx" ON "video_device_stats"("deviceType");

-- CreateIndex
CREATE UNIQUE INDEX "video_device_stats_videoId_date_deviceType_operatingSystem_key" ON "video_device_stats"("videoId", "date", "deviceType", "operatingSystem");

-- CreateIndex
CREATE INDEX "video_geography_stats_videoId_date_idx" ON "video_geography_stats"("videoId", "date");

-- CreateIndex
CREATE INDEX "video_geography_stats_country_idx" ON "video_geography_stats"("country");

-- CreateIndex
CREATE UNIQUE INDEX "video_geography_stats_videoId_date_country_key" ON "video_geography_stats"("videoId", "date", "country");

-- CreateIndex
CREATE INDEX "video_retention_videoId_idx" ON "video_retention"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "video_retention_videoId_elapsedRatio_key" ON "video_retention"("videoId", "elapsedRatio");

-- CreateIndex
CREATE INDEX "live_stream_timeline_videoId_idx" ON "live_stream_timeline"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "live_stream_timeline_videoId_livestreamPosition_key" ON "live_stream_timeline"("videoId", "livestreamPosition");

-- CreateIndex
CREATE INDEX "channel_daily_stats_channelId_date_idx" ON "channel_daily_stats"("channelId", "date");

-- CreateIndex
CREATE INDEX "channel_daily_stats_date_idx" ON "channel_daily_stats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "channel_daily_stats_channelId_date_key" ON "channel_daily_stats"("channelId", "date");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_config" ADD CONSTRAINT "notification_config_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_schedule" ADD CONSTRAINT "scan_schedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_run" ADD CONSTRAINT "scan_run_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "scan_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand" ADD CONSTRAINT "brand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_video" ADD CONSTRAINT "sponsored_video_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "tracked_video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_video" ADD CONSTRAINT "sponsored_video_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_channel" ADD CONSTRAINT "tracked_channel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_channel_snapshot" ADD CONSTRAINT "tracked_channel_snapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "tracked_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_video" ADD CONSTRAINT "tracked_video_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "tracked_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_video_snapshot" ADD CONSTRAINT "tracked_video_snapshot_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "tracked_video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_engagement_score" ADD CONSTRAINT "channel_engagement_score_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "tracked_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_channel" ADD CONSTRAINT "youtube_channel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video" ADD CONSTRAINT "video_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "youtube_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_daily_stats" ADD CONSTRAINT "video_daily_stats_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_traffic_source_stats" ADD CONSTRAINT "video_traffic_source_stats_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_device_stats" ADD CONSTRAINT "video_device_stats_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_geography_stats" ADD CONSTRAINT "video_geography_stats_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_retention" ADD CONSTRAINT "video_retention_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_stream_timeline" ADD CONSTRAINT "live_stream_timeline_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_daily_stats" ADD CONSTRAINT "channel_daily_stats_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "youtube_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

