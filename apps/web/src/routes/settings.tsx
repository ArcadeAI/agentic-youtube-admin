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

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
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

	useEffect(() => {
		fetchClients();
	}, [fetchClients]);

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

	return (
		<div className="container mx-auto max-w-3xl px-4 py-6">
			<h1 className="mb-6 font-bold text-xl">Settings</h1>

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
