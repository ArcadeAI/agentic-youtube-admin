import { Button } from "@agentic-youtube-admin/ui/components/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@agentic-youtube-admin/ui/components/card";
import { Input } from "@agentic-youtube-admin/ui/components/input";
import { Skeleton } from "@agentic-youtube-admin/ui/components/skeleton";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/tracking")({
	component: TrackingPage,
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
	notes: string | null;
}

function TrackingPage() {
	const { session } = Route.useRouteContext();
	const userId = session.data?.user.id ?? "";
	const arcadeUserId = session.data?.user.email ?? "";

	const [channels, setChannels] = useState<TrackedChannel[]>([]);
	const [loading, setLoading] = useState(true);

	// Track state
	const [channelInput, setChannelInput] = useState("");
	const [tracking, setTracking] = useState(false);

	// Poll state
	const [pollingId, setPollingId] = useState<string | null>(null);

	const fetchChannels = useCallback(async () => {
		try {
			const { data } = await api.api.tracking.channels.get({
				query: { userId },
			});
			setChannels((data as unknown as TrackedChannel[]) ?? []);
		} catch {
			toast.error("Failed to load tracked channels");
		} finally {
			setLoading(false);
		}
	}, [userId]);

	useEffect(() => {
		fetchChannels();
	}, [fetchChannels]);

	const handleTrack = async () => {
		if (!channelInput.trim()) return;
		setTracking(true);
		try {
			await (
				api.api.tracking.channels.track.post as (
					body: unknown,
				) => Promise<unknown>
			)({
				userId,
				channelIdOrHandle: channelInput.trim(),
			});
			toast.success("Channel tracked");
			setChannelInput("");
			await fetchChannels();
		} catch {
			toast.error(
				"Failed to track channel. Make sure the handle or ID is correct.",
			);
		} finally {
			setTracking(false);
		}
	};

	const handlePoll = async (channel: TrackedChannel) => {
		setPollingId(channel.id);
		try {
			await (
				api.api.tracking.channels({ id: channel.id }).poll.post as (
					body: unknown,
				) => Promise<unknown>
			)({
				userId,
				arcadeUserId,
			});
			toast.success(`Polled "${channel.channelTitle}"`);
			await fetchChannels();
		} catch {
			toast.error(`Failed to poll "${channel.channelTitle}"`);
		} finally {
			setPollingId(null);
		}
	};

	const handleUntrack = async (channel: TrackedChannel) => {
		try {
			await api.api.tracking
				.channels({ id: channel.id })
				.delete(null as never, {
					query: { userId },
				});
			toast.success(`Untracked "${channel.channelTitle}"`);
			await fetchChannels();
		} catch {
			toast.error("Failed to untrack channel");
		}
	};

	return (
		<div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
			<h1 className="font-bold text-2xl">Tracked Channels</h1>

			{/* Track a Channel */}
			<Card>
				<CardHeader>
					<CardTitle>Track a Channel</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							handleTrack();
						}}
						className="flex gap-2"
					>
						<Input
							placeholder="@handle or YouTube channel ID (UC...)"
							value={channelInput}
							onChange={(e) => setChannelInput(e.target.value)}
							className="flex-1"
						/>
						<Button type="submit" disabled={tracking || !channelInput.trim()}>
							{tracking ? "Tracking..." : "Track"}
						</Button>
					</form>
				</CardContent>
			</Card>

			{/* Tracked Channels List */}
			{loading ? (
				<div className="space-y-3">
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-20 w-full" />
				</div>
			) : channels.length === 0 ? (
				<Card>
					<CardContent className="py-6 text-center text-muted-foreground text-sm">
						No tracked channels yet. Enter a channel handle above to start
						tracking.
					</CardContent>
				</Card>
			) : (
				<div className="space-y-3">
					{channels.map((channel) => (
						<Card key={channel.id}>
							<Link
								to="/tracking/$channelId"
								params={{ channelId: channel.id }}
								className="block"
							>
								<CardHeader>
									<div className="flex items-center gap-3">
										{channel.channelThumbnail && (
											<img
												src={channel.channelThumbnail}
												alt={channel.channelTitle}
												className="size-10 rounded-full"
											/>
										)}
										<div>
											<CardTitle>{channel.channelTitle}</CardTitle>
											{channel.customUrl && (
												<p className="text-muted-foreground text-xs">
													{channel.customUrl}
												</p>
											)}
										</div>
									</div>
								</CardHeader>
								<CardContent>
									<div className="flex gap-4 text-muted-foreground text-xs">
										<span>
											Last polled:{" "}
											{channel.lastPolledAt
												? new Date(channel.lastPolledAt).toLocaleString()
												: "Never"}
										</span>
										{channel.lastPollError && (
											<span className="text-destructive">
												Error: {channel.lastPollError}
											</span>
										)}
									</div>
								</CardContent>
							</Link>
							<CardFooter className="gap-2">
								<Button
									variant="outline"
									size="xs"
									onClick={() => handlePoll(channel)}
									disabled={pollingId === channel.id}
								>
									{pollingId === channel.id ? "Polling..." : "Poll"}
								</Button>
								<Button
									variant="destructive"
									size="xs"
									onClick={() => handleUntrack(channel)}
								>
									Untrack
								</Button>
							</CardFooter>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
