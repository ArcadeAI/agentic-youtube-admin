import { Button } from "@agentic-youtube-admin/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@agentic-youtube-admin/ui/components/card";
import { Skeleton } from "@agentic-youtube-admin/ui/components/skeleton";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/channels/$channelId")({
	component: ChannelDetailPage,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			redirect({ to: "/login", throw: true });
		}
		return { session };
	},
});

interface Channel {
	id: string;
	channelId: string;
	channelTitle: string;
	channelThumbnail: string | null;
	customUrl: string | null;
	lastSyncAt: string | null;
	lastSyncStatus: string | null;
}

interface Video {
	id: string;
	videoId: string;
	title: string;
	thumbnailUrl: string | null;
	publishedAt: string;
	currentViews: number | string;
	currentLikes: number;
	currentComments: number;
	contentType: string | null;
}

interface ChannelAnalyticsDay {
	date: string;
	subscriberCount: number | null;
	totalViews: number | string;
	viewsGained: number | string | null;
	estimatedMinutesWatched: number | string | null;
	subscribersGained: number | null;
	subscribersLost: number | null;
}

function formatNumber(n: number | string | null | undefined): string {
	if (n == null) return "0";
	const num = typeof n === "string" ? Number(n) : n;
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
	return num.toLocaleString();
}

function ChannelDetailPage() {
	const { session } = Route.useRouteContext();
	const { channelId } = Route.useParams();
	const userId = session.data?.user.id ?? "";

	const [channel, setChannel] = useState<Channel | null>(null);
	const [videos, setVideos] = useState<Video[]>([]);
	const [analytics, setAnalytics] = useState<ChannelAnalyticsDay[]>([]);
	const [totalVideos, setTotalVideos] = useState(0);
	const [loading, setLoading] = useState(true);

	const fetchData = useCallback(async () => {
		try {
			const endDate = new Date().toISOString().slice(0, 10);
			const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
				.toISOString()
				.slice(0, 10);

			const [channelsRes, videosRes, analyticsRes] = await Promise.all([
				api.api.youtube.channels.get({ query: { userId } }),
				api.api.youtube
					.channels({ channelId })
					.videos.get({ query: { page: "1", pageSize: "50" } }),
				api.api.youtube
					.channels({ channelId })
					.analytics.get({ query: { startDate, endDate } }),
			]);

			const channels = (channelsRes.data as Channel[]) ?? [];
			const found = channels.find((c) => c.id === channelId);
			if (found) setChannel(found);

			const videosData = videosRes.data as {
				data: Video[];
				pagination: { total: number };
			} | null;
			if (videosData) {
				setVideos(videosData.data);
				setTotalVideos(videosData.pagination.total);
			}

			const analyticsData = analyticsRes.data as {
				data: ChannelAnalyticsDay[];
			} | null;
			if (analyticsData) {
				setAnalytics(analyticsData.data);
			}
		} catch {
			toast.error("Failed to load channel data");
		} finally {
			setLoading(false);
		}
	}, [channelId, userId]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	if (loading) {
		return (
			<div className="container mx-auto max-w-4xl px-4 py-6">
				<Skeleton className="mb-4 h-8 w-48" />
				<div className="grid grid-cols-3 gap-4">
					<Skeleton className="h-24" />
					<Skeleton className="h-24" />
					<Skeleton className="h-24" />
				</div>
				<Skeleton className="mt-6 h-64 w-full" />
			</div>
		);
	}

	// Compute summary from analytics
	const totalViewsGained = analytics.reduce(
		(sum, d) => sum + Number(d.viewsGained ?? 0),
		0,
	);
	const totalMinutesWatched = analytics.reduce(
		(sum, d) => sum + Number(d.estimatedMinutesWatched ?? 0),
		0,
	);
	const netSubscribers = analytics.reduce(
		(sum, d) => sum + (d.subscribersGained ?? 0) - (d.subscribersLost ?? 0),
		0,
	);
	const latestSubscriberCount =
		analytics.length > 0
			? analytics[analytics.length - 1].subscriberCount
			: null;

	return (
		<div className="container mx-auto max-w-4xl px-4 py-6">
			<div className="mb-4">
				<Link to="/dashboard">
					<Button variant="ghost" size="sm">
						&larr; Back to dashboard
					</Button>
				</Link>
			</div>

			{/* Channel header */}
			{channel && (
				<div className="mb-6 flex items-center gap-4">
					{channel.channelThumbnail && (
						<img
							src={channel.channelThumbnail}
							alt={channel.channelTitle}
							className="size-14 rounded-full"
						/>
					)}
					<div>
						<h1 className="font-bold text-xl">{channel.channelTitle}</h1>
						{channel.customUrl && (
							<p className="text-muted-foreground text-sm">
								{channel.customUrl}
							</p>
						)}
						<p className="text-muted-foreground text-xs">
							Last synced:{" "}
							{channel.lastSyncAt
								? new Date(channel.lastSyncAt).toLocaleString()
								: "Never"}
						</p>
					</div>
				</div>
			)}

			{/* Summary stats */}
			<div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
				<Card size="sm">
					<CardHeader>
						<CardDescription>Subscribers</CardDescription>
						<CardTitle>{formatNumber(latestSubscriberCount)}</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>Views (28d)</CardDescription>
						<CardTitle>{formatNumber(totalViewsGained)}</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>Watch time (28d)</CardDescription>
						<CardTitle>{formatNumber(totalMinutesWatched)} min</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>Net subs (28d)</CardDescription>
						<CardTitle>
							{netSubscribers >= 0 ? "+" : ""}
							{formatNumber(netSubscribers)}
						</CardTitle>
					</CardHeader>
				</Card>
			</div>

			{/* Videos */}
			<div>
				<h2 className="mb-3 font-semibold text-lg">Videos ({totalVideos})</h2>
				{videos.length === 0 ? (
					<p className="text-muted-foreground text-sm">No videos synced yet.</p>
				) : (
					<div className="space-y-2">
						{videos.map((video) => (
							<div
								key={video.id}
								className="flex items-start gap-3 border-b py-2 last:border-b-0"
							>
								{video.thumbnailUrl && (
									<img
										src={video.thumbnailUrl}
										alt={video.title}
										className="w-28 shrink-0 rounded object-cover"
									/>
								)}
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-sm">{video.title}</p>
									<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
										<span>
											{new Date(video.publishedAt).toLocaleDateString()}
										</span>
										<span>{formatNumber(video.currentViews)} views</span>
										<span>{formatNumber(video.currentLikes)} likes</span>
										<span>{formatNumber(video.currentComments)} comments</span>
										{video.contentType && (
											<span className="rounded bg-muted px-1">
												{video.contentType}
											</span>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Analytics rows */}
			{analytics.length > 0 && (
				<div className="mt-6">
					<h2 className="mb-3 font-semibold text-lg">
						Daily analytics (last 28 days)
					</h2>
					<div className="overflow-x-auto">
						<table className="w-full text-xs">
							<thead>
								<tr className="border-b text-left text-muted-foreground">
									<th className="pr-4 pb-2">Date</th>
									<th className="pr-4 pb-2">Views</th>
									<th className="pr-4 pb-2">Watch time</th>
									<th className="pr-4 pb-2">Subs gained</th>
									<th className="pr-4 pb-2">Subs lost</th>
								</tr>
							</thead>
							<tbody>
								{analytics.map((day) => (
									<tr key={day.date} className="border-b last:border-b-0">
										<td className="py-1.5 pr-4">
											{new Date(day.date).toLocaleDateString()}
										</td>
										<td className="py-1.5 pr-4">
											{formatNumber(day.viewsGained)}
										</td>
										<td className="py-1.5 pr-4">
											{formatNumber(day.estimatedMinutesWatched)} min
										</td>
										<td className="py-1.5 pr-4">
											{day.subscribersGained ?? 0}
										</td>
										<td className="py-1.5 pr-4">{day.subscribersLost ?? 0}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
