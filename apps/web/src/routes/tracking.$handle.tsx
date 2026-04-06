import { Button } from "@agentic-youtube-admin/ui/components/button";
import {
	Card,
	CardContent,
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

function TrackedChannelDetailPage() {
	const { session } = Route.useRouteContext();
	const { handle } = Route.useParams();
	const userId = session.data?.user.id ?? "";
	const arcadeUserId = session.data?.user.email ?? "";

	const [channel, setChannel] = useState<TrackedChannel | null>(null);
	const [videos, setVideos] = useState<TrackedVideo[]>([]);
	const [loading, setLoading] = useState(true);
	const [polling, setPolling] = useState(false);
	const [discovering, setDiscovering] = useState(false);

	// Find the channel by customUrl or channelId match
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
				const { data: videosData } = await api.api.tracking
					.channels({ id: matched.id })
					.videos.get({ query: { userId } });
				setVideos((videosData as unknown as TrackedVideo[]) ?? []);
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
			<div className="container mx-auto max-w-3xl space-y-4 px-4 py-6">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-32 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	if (!channel) {
		return (
			<div className="container mx-auto max-w-3xl px-4 py-6">
				<Link to="/tracking" className="text-muted-foreground text-sm">
					&larr; Back to Tracking
				</Link>
				<p className="mt-4">Channel not found.</p>
			</div>
		);
	}

	return (
		<div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
			<Link to="/tracking" className="text-muted-foreground text-sm">
				&larr; Back to Tracking
			</Link>

			{/* Channel Header */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							{channel.channelThumbnail && (
								<img
									src={channel.channelThumbnail}
									alt={channel.channelTitle}
									className="size-12 rounded-full"
								/>
							)}
							<div>
								<CardTitle>{channel.channelTitle}</CardTitle>
								{channel.customUrl && (
									<p className="text-muted-foreground text-xs">
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
				</CardHeader>
			</Card>

			{/* Videos List */}
			<div className="space-y-3">
				<h2 className="font-semibold text-lg">Videos ({videos.length})</h2>

				{videos.length === 0 ? (
					<Card>
						<CardContent className="py-6 text-center text-muted-foreground text-sm">
							No videos discovered yet. Click "Discover Videos" to fetch this
							channel's videos.
						</CardContent>
					</Card>
				) : (
					videos.map((video) => (
						<Card key={video.id} size="sm">
							<CardContent className="flex items-center gap-3 py-2">
								{video.thumbnailUrl && (
									<img
										src={video.thumbnailUrl}
										alt={video.title}
										className="w-28 shrink-0 rounded object-cover"
									/>
								)}
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-sm">{video.title}</p>
									<div className="mt-1 flex gap-3 text-muted-foreground text-xs">
										<span>
											{new Date(video.publishedAt).toLocaleDateString()}
										</span>
										{video.contentType && <span>{video.contentType}</span>}
									</div>
								</div>
							</CardContent>
						</Card>
					))
				)}
			</div>
		</div>
	);
}
