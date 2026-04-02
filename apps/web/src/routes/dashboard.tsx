import { Button } from "@agentic-youtube-admin/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@agentic-youtube-admin/ui/components/card";
import { Skeleton } from "@agentic-youtube-admin/ui/components/skeleton";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

const PENDING_AUTH_KEY = "yt_pending_auth_id";

const searchSchema = z.object({
	youtube: z.enum(["connected", "error"]).optional(),
});

export const Route = createFileRoute("/dashboard")({
	component: DashboardPage,
	validateSearch: searchSchema,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			redirect({
				to: "/login",
				throw: true,
			});
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

function DashboardPage() {
	const { session } = Route.useRouteContext();
	const { youtube } = Route.useSearch();
	const userId = session.data?.user.id ?? "";
	const userEmail = session.data?.user.email ?? "";

	const [channels, setChannels] = useState<Channel[]>([]);
	const [loading, setLoading] = useState(true);
	const [connecting, setConnecting] = useState(false);
	const [syncingId, setSyncingId] = useState<string | null>(null);

	const fetchChannels = useCallback(async () => {
		try {
			const { data } = await api.api.youtube.channels.get({
				query: { userId },
			});
			setChannels((data as Channel[]) ?? []);
		} catch {
			toast.error("Failed to load channels");
		} finally {
			setLoading(false);
		}
	}, [userId]);

	// After OAuth redirect, complete the connection using the stored authId
	useEffect(() => {
		if (youtube !== "connected") return;

		const authId = sessionStorage.getItem(PENDING_AUTH_KEY);
		if (!authId) {
			// No pending auth — just refresh channels (might have been synced already)
			toast.success("YouTube account connected");
			fetchChannels();
			return;
		}

		sessionStorage.removeItem(PENDING_AUTH_KEY);
		setConnecting(true);

		(async () => {
			try {
				await api.api.youtube.channels.completeConnection.post({
					authId,
				});
				toast.success("YouTube channel connected and synced");
				await fetchChannels();
			} catch {
				toast.error("Connected but failed to sync channel data");
				await fetchChannels();
			} finally {
				setConnecting(false);
			}
		})();
	}, [youtube, fetchChannels]);

	useEffect(() => {
		if (youtube === "error") {
			toast.error("Failed to connect YouTube account");
		}
	}, [youtube]);

	useEffect(() => {
		fetchChannels();
	}, [fetchChannels]);

	const handleConnect = async () => {
		setConnecting(true);
		try {
			const { data } = await api.api.youtube.channels.connect.post();
			const result = data as
				| { authUrl?: string; authId?: string; connected?: boolean }
				| undefined;

			if (result?.authUrl) {
				// Store authId so we can complete the connection after redirect
				if (result.authId) {
					sessionStorage.setItem(PENDING_AUTH_KEY, result.authId);
				}
				window.location.href = result.authUrl;
				return;
			}

			if (result?.connected) {
				toast.success("YouTube channel connected");
				await fetchChannels();
			}
		} catch {
			toast.error("Failed to start YouTube connection");
		} finally {
			setConnecting(false);
		}
	};

	const handleSync = async (channel: Channel) => {
		setSyncingId(channel.id);
		try {
			await api.api.youtube.channels({ channelId: channel.id }).sync.post({
				userId,
				arcadeUserId: userEmail,
			});
			toast.success(`Synced "${channel.channelTitle}"`);
			await fetchChannels();
		} catch {
			toast.error(`Failed to sync "${channel.channelTitle}"`);
		} finally {
			setSyncingId(null);
		}
	};

	return (
		<div className="container mx-auto max-w-3xl px-4 py-6">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="font-bold text-xl">Dashboard</h1>
				<p className="text-muted-foreground text-sm">
					{session.data?.user.name || session.data?.user.email}
				</p>
			</div>

			{loading || connecting ? (
				<div className="space-y-4">
					<Skeleton className="h-32 w-full" />
					{connecting && (
						<p className="text-center text-muted-foreground text-sm">
							Connecting your YouTube channel...
						</p>
					)}
				</div>
			) : channels.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Connect your YouTube channel</CardTitle>
						<CardDescription>
							Link your YouTube account via Arcade to start tracking analytics.
						</CardDescription>
					</CardHeader>
					<CardFooter>
						<Button onClick={handleConnect} disabled={connecting}>
							{connecting ? "Redirecting..." : "Connect YouTube"}
						</Button>
					</CardFooter>
				</Card>
			) : (
				<div className="space-y-4">
					{channels.map((channel) => (
						<Card key={channel.id}>
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
											<CardDescription>{channel.customUrl}</CardDescription>
										)}
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<div className="flex gap-4 text-muted-foreground text-xs">
									<span>
										Last sync:{" "}
										{channel.lastSyncAt
											? new Date(channel.lastSyncAt).toLocaleString()
											: "Never"}
									</span>
									{channel.lastSyncStatus && (
										<span>Status: {channel.lastSyncStatus}</span>
									)}
								</div>
							</CardContent>
							<CardFooter>
								<Button
									variant="outline"
									size="sm"
									onClick={() => handleSync(channel)}
									disabled={syncingId === channel.id}
								>
									{syncingId === channel.id ? "Syncing..." : "Sync Channel"}
								</Button>
							</CardFooter>
						</Card>
					))}

					<div className="pt-2">
						<Button
							variant="outline"
							size="sm"
							onClick={handleConnect}
							disabled={connecting}
						>
							{connecting ? "Redirecting..." : "Connect another channel"}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
