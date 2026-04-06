import { Button } from "@agentic-youtube-admin/ui/components/button";
import {
	Card,
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

export const Route = createFileRoute("/tracking/$handle")({
	component: TrackedChannelDetailPage,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			redirect({ to: "/login", throw: true });
		}
		return { session };
	},
});

interface TrackedChannel {
	id: string;
	channelId: string;
	channelTitle: string;
	channelThumbnail: string | null;
	customUrl: string | null;
	lastPolledAt: string | null;
	lastPollError: string | null;
}

interface TrackedVideo {
	id: string;
	videoId: string;
	title: string;
	thumbnailUrl: string | null;
	publishedAt: string;
	contentType: string | null;
}

interface ChannelSnapshot {
	date: string;
	subscriberCount: number | null;
	totalViews: number | string;
	videoCount: number;
	subscriberCountHidden: boolean;
}

interface EngagementScore {
	date: string;
	score: number;
	scoreNormalized: number | null;
	periodType: string;
	formulaVersion: string;
}

function formatNumber(n: number | string | null | undefined): string {
	if (n == null) return "0";
	const num = typeof n === "string" ? Number(n) : n;
	if (Number.isNaN(num)) return "0";
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
	return num.toLocaleString();
}

function TrackedChannelDetailPage() {
	const { session } = Route.useRouteContext();
	const { handle } = Route.useParams();
	const userId = session.data?.user.id ?? "";
	const arcadeUserId = session.data?.user.email ?? "";

	const [channel, setChannel] = useState<TrackedChannel | null>(null);
	const [videos, setVideos] = useState<TrackedVideo[]>([]);
	const [snapshots, setSnapshots] = useState<ChannelSnapshot[]>([]);
	const [scores, setScores] = useState<EngagementScore[]>([]);
	const [loading, setLoading] = useState(true);
	const [polling, setPolling] = useState(false);
	const [discovering, setDiscovering] = useState(false);

	const findChannel = useCallback(
		(channels: TrackedChannel[]) => {
			return (
				channels.find(
					(c) =>
						c.customUrl === handle ||
						c.customUrl === `@${handle}` ||
						c.channelId === handle,
				) ?? null
			);
		},
		[handle],
	);

	const fetchData = useCallback(async () => {
		try {
			const { data: channelsData } = await api.api.tracking.channels.get({
				query: { userId },
			});
			const allChannels = (channelsData as unknown as TrackedChannel[]) ?? [];
			const matched = findChannel(allChannels);
			setChannel(matched);

			if (matched) {
				const endDate = new Date().toISOString().slice(0, 10);
				const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
					.toISOString()
					.slice(0, 10);

				const [videosRes, snapshotsRes, scoresRes] = await Promise.all([
					api.api.tracking
						.channels({ id: matched.id })
						.videos.get({ query: { userId } }),
					api.api.tracking
						.channels({ id: matched.id })
						.snapshots.get({ query: { userId, startDate, endDate } }),
					api.api.tracking
						.channels({ id: matched.id })
						.scores.get({ query: { userId, startDate, endDate } }),
				]);
				setVideos((videosRes.data as unknown as TrackedVideo[]) ?? []);
				setSnapshots((snapshotsRes.data as unknown as ChannelSnapshot[]) ?? []);
				setScores((scoresRes.data as unknown as EngagementScore[]) ?? []);
			}
		} catch {
			toast.error("Failed to load channel data");
		} finally {
			setLoading(false);
		}
	}, [userId, findChannel]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const handlePoll = async () => {
		if (!channel) return;
		setPolling(true);
		try {
			await (
				api.api.tracking.channels({ id: channel.id }).poll.post as (
					body: unknown,
				) => Promise<unknown>
			)({
				userId,
				arcadeUserId,
			});
			toast.success("Channel polled");
			await fetchData();
		} catch {
			toast.error("Poll failed");
		} finally {
			setPolling(false);
		}
	};

	const handleDiscover = async () => {
		if (!channel) return;
		setDiscovering(true);
		try {
			const { data } = await (
				api.api.tracking.channels({ id: channel.id }).discover.post as (
					body: unknown,
				) => Promise<{ data: unknown }>
			)({
				userId,
				arcadeUserId,
			});
			const result = data as {
				totalDiscovered?: number;
				upsertedCount?: number;
			} | null;
			toast.success(`Discovered ${result?.upsertedCount ?? 0} videos`);
			await fetchData();
		} catch {
			toast.error("Video discovery failed");
		} finally {
			setDiscovering(false);
		}
	};

	if (loading) {
		return (
			<div className="container mx-auto max-w-4xl space-y-4 px-4 py-6">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-32 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	if (!channel) {
		return (
			<div className="container mx-auto max-w-4xl px-4 py-6">
				<Link to="/tracking" className="text-muted-foreground text-sm">
					&larr; Back to Tracking
				</Link>
				<p className="mt-4">Channel not found.</p>
			</div>
		);
	}

	// Summary stats from latest snapshot
	const latestSnapshot =
		snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
	const latestScore = scores.length > 0 ? scores[scores.length - 1] : null;

	return (
		<div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
			<Link to="/tracking" className="text-muted-foreground text-sm">
				&larr; Back to Tracking
			</Link>

			{/* Channel Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
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
							Last polled:{" "}
							{channel.lastPolledAt
								? new Date(channel.lastPolledAt).toLocaleString()
								: "Never"}
						</p>
					</div>
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={handlePoll}
						disabled={polling}
					>
						{polling ? "Polling..." : "Poll Now"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={handleDiscover}
						disabled={discovering}
					>
						{discovering ? "Discovering..." : "Discover Videos"}
					</Button>
				</div>
			</div>

			{/* Summary Stats */}
			{latestSnapshot && (
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<Card size="sm">
						<CardHeader>
							<CardDescription>Subscribers</CardDescription>
							<CardTitle>
								{latestSnapshot.subscriberCountHidden
									? "Hidden"
									: formatNumber(latestSnapshot.subscriberCount)}
							</CardTitle>
						</CardHeader>
					</Card>
					<Card size="sm">
						<CardHeader>
							<CardDescription>Total Views</CardDescription>
							<CardTitle>{formatNumber(latestSnapshot.totalViews)}</CardTitle>
						</CardHeader>
					</Card>
					<Card size="sm">
						<CardHeader>
							<CardDescription>Videos</CardDescription>
							<CardTitle>{formatNumber(latestSnapshot.videoCount)}</CardTitle>
						</CardHeader>
					</Card>
					{latestScore && (
						<Card size="sm">
							<CardHeader>
								<CardDescription>Engagement Score</CardDescription>
								<CardTitle>{latestScore.score.toFixed(4)}</CardTitle>
							</CardHeader>
						</Card>
					)}
				</div>
			)}

			{/* Videos */}
			<div>
				<h2 className="mb-3 font-semibold text-lg">Videos ({videos.length})</h2>
				{videos.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No videos discovered yet. Click "Discover Videos" to fetch this
						channel's videos.
					</p>
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

			{/* Channel Snapshots Table */}
			{snapshots.length > 0 && (
				<div>
					<h2 className="mb-3 font-semibold text-lg">
						Channel snapshots (last 28 days)
					</h2>
					<div className="overflow-x-auto">
						<table className="w-full text-xs">
							<thead>
								<tr className="border-b text-left text-muted-foreground">
									<th className="pr-4 pb-2">Date</th>
									<th className="pr-4 pb-2">Subscribers</th>
									<th className="pr-4 pb-2">Total Views</th>
									<th className="pr-4 pb-2">Videos</th>
								</tr>
							</thead>
							<tbody>
								{snapshots.map((s) => (
									<tr key={s.date} className="border-b last:border-b-0">
										<td className="py-1.5 pr-4">
											{new Date(s.date).toLocaleDateString()}
										</td>
										<td className="py-1.5 pr-4">
											{s.subscriberCountHidden
												? "Hidden"
												: formatNumber(s.subscriberCount)}
										</td>
										<td className="py-1.5 pr-4">
											{formatNumber(s.totalViews)}
										</td>
										<td className="py-1.5 pr-4">{s.videoCount}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Engagement Scores */}
			{scores.length > 0 && (
				<div>
					<h2 className="mb-3 font-semibold text-lg">Engagement scores</h2>
					<div className="overflow-x-auto">
						<table className="w-full text-xs">
							<thead>
								<tr className="border-b text-left text-muted-foreground">
									<th className="pr-4 pb-2">Date</th>
									<th className="pr-4 pb-2">Score</th>
									<th className="pr-4 pb-2">Period</th>
									<th className="pr-4 pb-2">Formula</th>
								</tr>
							</thead>
							<tbody>
								{scores.map((s) => (
									<tr key={s.date} className="border-b last:border-b-0">
										<td className="py-1.5 pr-4">
											{new Date(s.date).toLocaleDateString()}
										</td>
										<td className="py-1.5 pr-4">{s.score.toFixed(4)}</td>
										<td className="py-1.5 pr-4">{s.periodType}</td>
										<td className="py-1.5 pr-4">{s.formulaVersion}</td>
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
