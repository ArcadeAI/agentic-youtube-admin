import type { Prisma } from "@agentic-youtube-admin/db";
import type { ScoreChannelResponse } from "../schemas/score-channel";

export function mapScoreChannelToDb(
	score: ScoreChannelResponse,
	channelId: string,
	date: Date,
	periodType: string,
	periodStart: Date,
	periodEnd: Date,
	formulaVersion: string,
): Prisma.ChannelEngagementScoreUncheckedCreateInput {
	return {
		channelId,
		date,
		periodType,
		periodStart,
		periodEnd,
		score: score.engagement_score,
		formulaVersion,
		formulaName: "base_engagement",
		inputData: {
			subscriberCount: score.subscriber_count,
			videosAnalyzed: score.videos_analyzed,
			averageViews: score.average_views,
			averageLikes: score.average_likes,
			averageComments: score.average_comments,
		},
	};
}
