import { env } from "@agentic-youtube-admin/env/web";
import { Button } from "@agentic-youtube-admin/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@agentic-youtube-admin/ui/components/card";
import { Input } from "@agentic-youtube-admin/ui/components/input";
import { Label } from "@agentic-youtube-admin/ui/components/label";
import { Skeleton } from "@agentic-youtube-admin/ui/components/skeleton";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
	SlackChannelPicker,
	type SlackDestination,
} from "@/components/slack-channel-picker";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

const SCAN_TYPES = [
	{ value: "owned_backfill", label: "Owned channel backfill" },
	{ value: "owned_daily_sync", label: "Owned channel daily sync" },
	{ value: "tracked_daily_poll", label: "Tracked channel daily poll" },
] as const;

const SLACK_PENDING_AUTH_KEY = "slack_pending_auth_id";

const searchSchema = z.object({
	slack: z.enum(["connected", "error"]).optional(),
});

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
	validateSearch: searchSchema,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			redirect({ to: "/login", throw: true });
		}
		return { session };
	},
});

interface OAuthClient {
	clientId: string;
	name: string | null;
	redirectUris: string[];
	createdAt: string | null;
}

const AUTH_BASE = `${env.VITE_SERVER_URL}/api/auth`;

function SettingsPage() {
	const { slack } = Route.useSearch();
	const [clients, setClients] = useState<OAuthClient[]>([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);

	// Create form
	const [clientName, setClientName] = useState("");
	const [redirectUri, setRedirectUri] = useState("");

	// Show secret once after creation
	const [newClientSecret, setNewClientSecret] = useState<{
		clientId: string;
		clientSecret: string;
	} | null>(null);

	// Slack state
	const [slackConnected, setSlackConnected] = useState(false);
	const [slackLoading, setSlackLoading] = useState(true);
	const [slackConnecting, setSlackConnecting] = useState(false);
	const [slackUser, setSlackUser] = useState<{
		name?: string;
		username?: string;
	} | null>(null);

	// Notification config state
	const [notifName, setNotifName] = useState("");
	const [notifType, setNotifType] = useState<string>("owned_daily_sync");
	const [notifDest, setNotifDest] = useState<SlackDestination | null>(null);
	const [creatingNotif, setCreatingNotif] = useState(false);
	const [notifications, setNotifications] = useState<
		Array<{
			id: string;
			name: string;
			notificationType: string;
			deliveryMethod: string;
			deliveryConfig: Record<string, unknown> | null;
			isActive: boolean;
		}>
	>([]);
	const [notifsLoading, setNotifsLoading] = useState(true);

	const fetchClients = useCallback(async () => {
		try {
			const { data } = await authClient.oauth2.getClients();
			const raw = (data ?? []) as unknown as Record<string, unknown>[];
			setClients(
				raw.map((c) => ({
					clientId: (c.clientId ?? c.client_id ?? "") as string,
					name: (c.name ?? c.client_name ?? null) as string | null,
					redirectUris: (c.redirectUris ?? c.redirect_uris ?? []) as string[],
					createdAt: (c.createdAt ?? c.created_at ?? null) as string | null,
				})),
			);
		} catch {
			toast.error("Failed to load OAuth clients");
		} finally {
			setLoading(false);
		}
	}, []);

	const fetchSlackStatus = useCallback(async () => {
		try {
			const { data } = await api.api.slack.status.get();
			if (data && typeof data === "object" && "connected" in data) {
				setSlackConnected(data.connected as boolean);
			}
		} catch {
			// Slack status check failed — not critical
		} finally {
			setSlackLoading(false);
		}
	}, []);

	// Complete Slack connection after OAuth redirect
	useEffect(() => {
		if (slack !== "connected") return;

		const authId = sessionStorage.getItem(SLACK_PENDING_AUTH_KEY);
		if (!authId) {
			toast.success("Slack connected");
			setSlackConnected(true);
			setSlackLoading(false);
			return;
		}

		sessionStorage.removeItem(SLACK_PENDING_AUTH_KEY);
		setSlackConnecting(true);

		(async () => {
			try {
				const { data } = await api.api.slack["complete-connection"].post({
					authId,
				});
				if (data && typeof data === "object" && "user" in data) {
					const user = data.user as Record<string, unknown>;
					setSlackUser({
						name: (user.display_name ?? user.real_name) as string | undefined,
						username: user.username as string | undefined,
					});
				}
				setSlackConnected(true);
				toast.success("Slack connected successfully");
			} catch {
				toast.error("Failed to complete Slack connection");
			} finally {
				setSlackConnecting(false);
				setSlackLoading(false);
			}
		})();
	}, [slack]);

	const { session } = Route.useRouteContext();
	const userId = session.data?.user.id ?? "";

	const fetchNotifications = useCallback(async () => {
		if (!userId) return;
		try {
			const { data } = await api.api.notifications.get({
				query: { userId },
			});
			if (Array.isArray(data)) {
				setNotifications(
					data.map((n: Record<string, unknown>) => ({
						id: n.id as string,
						name: n.name as string,
						notificationType: n.notificationType as string,
						deliveryMethod: n.deliveryMethod as string,
						deliveryConfig: n.deliveryConfig as Record<string, unknown> | null,
						isActive: n.isActive as boolean,
					})),
				);
			}
		} catch {
			// Non-critical
		} finally {
			setNotifsLoading(false);
		}
	}, [userId]);

	useEffect(() => {
		fetchClients();
		fetchNotifications();
		if (slack !== "connected") {
			fetchSlackStatus();
		}
	}, [fetchClients, fetchSlackStatus, fetchNotifications, slack]);

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!clientName || !redirectUri) {
			toast.error("Name and redirect URI are required");
			return;
		}
		setCreating(true);
		try {
			const { data } = await authClient.oauth2.register({
				client_name: clientName,
				redirect_uris: [redirectUri],
			});
			if (data) {
				const d = data as Record<string, unknown>;
				setNewClientSecret({
					clientId: (d.clientId ?? d.client_id) as string,
					clientSecret: (d.clientSecret ?? d.client_secret ?? "") as string,
				});
				toast.success("OAuth client created");
				setClientName("");
				setRedirectUri("");
				await fetchClients();
			}
		} catch {
			toast.error("Failed to create OAuth client");
		} finally {
			setCreating(false);
		}
	};

	const handleDelete = async (clientId: string) => {
		try {
			await authClient.oauth2.deleteClient({ client_id: clientId });
			toast.success("Client deleted");
			await fetchClients();
		} catch {
			toast.error("Failed to delete client");
		}
	};

	const handleConnectSlack = async () => {
		setSlackConnecting(true);
		try {
			const { data } = await api.api.slack.connect.post();
			if (!data || typeof data !== "object") {
				toast.error("Unexpected response from server");
				return;
			}

			if ("connected" in data && data.connected) {
				setSlackConnected(true);
				toast.success("Slack is already connected");
				return;
			}

			if ("needsAuth" in data && data.needsAuth) {
				const d = data as { authUrl: string; authId: string };
				sessionStorage.setItem(SLACK_PENDING_AUTH_KEY, d.authId);
				window.location.href = d.authUrl;
				return;
			}
		} catch {
			toast.error("Failed to initiate Slack connection");
		} finally {
			setSlackConnecting(false);
		}
	};

	const handleCreateNotification = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!notifName || !notifDest) {
			toast.error("Name and Slack destination are required");
			return;
		}
		setCreatingNotif(true);
		try {
			const deliveryConfig =
				notifDest.type === "dm"
					? { dmToSelf: true }
					: { channelName: notifDest.channelName };

			await (api.api.notifications.post as (body: unknown) => Promise<unknown>)(
				{
					userId,
					name: notifName,
					notificationType: notifType,
					deliveryMethod: "slack",
					deliveryConfig,
				},
			);
			toast.success("Notification created");
			setNotifName("");
			setNotifType("new_video");
			setNotifDest(null);
			await fetchNotifications();
		} catch {
			toast.error("Failed to create notification");
		} finally {
			setCreatingNotif(false);
		}
	};

	const handleDeleteNotification = async (id: string) => {
		try {
			await api.api.notifications({ id }).delete(null, {
				query: { userId },
			});
			toast.success("Notification deleted");
			await fetchNotifications();
		} catch {
			toast.error("Failed to delete notification");
		}
	};

	return (
		<div className="container mx-auto max-w-3xl px-4 py-6">
			<h1 className="mb-6 font-bold text-xl">Settings</h1>

			{/* Slack Integration */}
			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Slack Integration</CardTitle>
					<CardDescription>
						Connect your Slack workspace to receive scan notifications.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{slackLoading ? (
						<Skeleton className="h-5 w-48" />
					) : slackConnected ? (
						<div className="text-sm">
							<span className="mr-2 font-medium text-green-600">Connected</span>
							{slackUser && (
								<span className="text-muted-foreground">
									as {slackUser.name ?? slackUser.username}
								</span>
							)}
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							Not connected. Connect Slack to enable notifications.
						</p>
					)}
				</CardContent>
				{!slackLoading && !slackConnected && (
					<CardFooter>
						<Button onClick={handleConnectSlack} disabled={slackConnecting}>
							{slackConnecting ? "Connecting..." : "Connect Slack"}
						</Button>
					</CardFooter>
				)}
			</Card>

			{/* Notification Config — only when Slack is connected */}
			{slackConnected && (
				<>
					<Card className="mb-6 overflow-visible">
						<CardHeader>
							<CardTitle>Create Notification</CardTitle>
							<CardDescription>
								Get notified in Slack when a scheduled scan completes.
							</CardDescription>
						</CardHeader>
						<form onSubmit={handleCreateNotification}>
							<CardContent>
								<div className="space-y-3">
									<div className="space-y-1">
										<Label htmlFor="notif-name">Name</Label>
										<Input
											id="notif-name"
											value={notifName}
											onChange={(e) => setNotifName(e.target.value)}
											placeholder="e.g. Daily sync alerts"
										/>
									</div>
									<div className="space-y-1">
										<Label htmlFor="notif-type">Scan type</Label>
										<select
											id="notif-type"
											value={notifType}
											onChange={(e) => setNotifType(e.target.value)}
											className="flex h-9 w-full border border-input bg-background px-3 py-2 text-sm"
										>
											{SCAN_TYPES.map((t) => (
												<option key={t.value} value={t.value}>
													{t.label}
												</option>
											))}
										</select>
									</div>
									<div className="space-y-1">
										<Label>Slack destination</Label>
										<SlackChannelPicker
											value={notifDest}
											onChange={setNotifDest}
										/>
									</div>
								</div>
							</CardContent>
							<CardFooter>
								<Button type="submit" disabled={creatingNotif}>
									{creatingNotif ? "Creating..." : "Create notification"}
								</Button>
							</CardFooter>
						</form>
					</Card>

					{/* Existing notifications */}
					<h2 className="mb-3 font-semibold text-lg">Your Notifications</h2>
					{notifsLoading ? (
						<Skeleton className="mb-6 h-24 w-full" />
					) : notifications.length === 0 ? (
						<p className="mb-6 text-muted-foreground text-sm">
							No notifications yet. Create one above.
						</p>
					) : (
						<div className="mb-6 space-y-3">
							{notifications.map((n) => {
								const config = n.deliveryConfig as {
									channelName?: string;
									dmToSelf?: boolean;
								} | null;
								const dest = config?.dmToSelf
									? "DM to me"
									: config?.channelName
										? `#${config.channelName}`
										: "Unknown";
								return (
									<Card key={n.id} size="sm">
										<CardHeader>
											<CardTitle>{n.name}</CardTitle>
											<CardDescription>
												{n.notificationType.replace(/_/g, " ")} &middot;{" "}
												{n.deliveryMethod} &middot; {dest}
											</CardDescription>
										</CardHeader>
										<CardFooter>
											<Button
												variant="destructive"
												size="sm"
												onClick={() => handleDeleteNotification(n.id)}
											>
												Delete
											</Button>
										</CardFooter>
									</Card>
								);
							})}
						</div>
					)}
				</>
			)}

			{/* Arcade configuration reference */}
			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Arcade OAuth2 Provider Endpoints</CardTitle>
					<CardDescription>
						Use these values when configuring the OAuth2 auth provider in your
						Arcade account.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-2 font-mono text-xs">
						<div>
							<span className="text-muted-foreground">Authorization URL: </span>
							<code>{AUTH_BASE}/oauth2/authorize</code>
						</div>
						<div>
							<span className="text-muted-foreground">Token URL: </span>
							<code>{AUTH_BASE}/oauth2/token</code>
						</div>
						<div>
							<span className="text-muted-foreground">UserInfo URL: </span>
							<code>{AUTH_BASE}/oauth2/userinfo</code>
						</div>
						<div>
							<span className="text-muted-foreground">Scopes: </span>
							<code>openid profile email</code>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Secret display (shown once after creation) */}
			{newClientSecret && (
				<Card className="mb-6 border-yellow-500/50">
					<CardHeader>
						<CardTitle>Save your client secret</CardTitle>
						<CardDescription>
							This secret will not be shown again. Copy it now.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2 font-mono text-xs">
							<div>
								<span className="text-muted-foreground">Client ID: </span>
								<code>{newClientSecret.clientId}</code>
							</div>
							<div>
								<span className="text-muted-foreground">Client Secret: </span>
								<code>{newClientSecret.clientSecret}</code>
							</div>
						</div>
					</CardContent>
					<CardFooter>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setNewClientSecret(null)}
						>
							Dismiss
						</Button>
					</CardFooter>
				</Card>
			)}

			{/* Create new client */}
			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Create OAuth Client</CardTitle>
					<CardDescription>
						Create credentials to connect this app to Arcade as an OAuth2
						provider.
					</CardDescription>
				</CardHeader>
				<form onSubmit={handleCreate}>
					<CardContent>
						<div className="space-y-3">
							<div className="space-y-1">
								<Label htmlFor="client-name">Client name</Label>
								<Input
									id="client-name"
									value={clientName}
									onChange={(e) => setClientName(e.target.value)}
									placeholder="e.g. My Arcade MCP"
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="redirect-uri">Redirect URI</Label>
								<Input
									id="redirect-uri"
									value={redirectUri}
									onChange={(e) => setRedirectUri(e.target.value)}
									placeholder="https://cloud.arcade.dev/api/v1/oauth/callback"
								/>
							</div>
						</div>
					</CardContent>
					<CardFooter>
						<Button type="submit" disabled={creating}>
							{creating ? "Creating..." : "Create client"}
						</Button>
					</CardFooter>
				</form>
			</Card>

			{/* Existing clients */}
			<h2 className="mb-3 font-semibold text-lg">Your OAuth Clients</h2>
			{loading ? (
				<Skeleton className="h-24 w-full" />
			) : clients.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No OAuth clients yet. Create one above to get started.
				</p>
			) : (
				<div className="space-y-3">
					{clients.map((client) => (
						<Card key={client.clientId} size="sm">
							<CardHeader>
								<CardTitle>{client.name ?? "Unnamed client"}</CardTitle>
								<CardDescription>
									<code className="text-xs">{client.clientId}</code>
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="text-muted-foreground text-xs">
									<span>Redirect URIs: </span>
									{(client.redirectUris ?? []).join(", ") || "none"}
								</div>
							</CardContent>
							<CardFooter>
								<Button
									variant="destructive"
									size="sm"
									onClick={() => handleDelete(client.clientId)}
								>
									Delete
								</Button>
							</CardFooter>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
