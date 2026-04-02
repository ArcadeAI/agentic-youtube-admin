import { Button } from "@agentic-youtube-admin/ui/components/button";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@agentic-youtube-admin/ui/components/card";
import { Skeleton } from "@agentic-youtube-admin/ui/components/skeleton";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";

const searchSchema = z.object({
	client_id: z.string(),
	scope: z.string().optional(),
});

export const Route = createFileRoute("/consent")({
	component: ConsentPage,
	validateSearch: searchSchema,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			redirect({ to: "/login", throw: true });
		}
		return { session };
	},
});

interface OAuthClientInfo {
	name: string | null;
	icon: string | null;
	uri: string | null;
}

function ConsentPage() {
	const { client_id, scope } = Route.useSearch();
	const [clientInfo, setClientInfo] = useState<OAuthClientInfo | null>(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);

	const scopes = scope?.split(" ").filter(Boolean) ?? [];

	useEffect(() => {
		(async () => {
			try {
				const { data } = await authClient.oauth2.getClient({
					query: { client_id },
				});
				if (data) {
					const d = data as Record<string, unknown>;
					setClientInfo({
						name: (d.name as string) ?? null,
						icon: (d.icon as string) ?? null,
						uri: (d.uri as string) ?? null,
					});
				}
			} catch {
				// Client info not available — show generic consent
			} finally {
				setLoading(false);
			}
		})();
	}, [client_id]);

	const handleConsent = async (accept: boolean) => {
		setSubmitting(true);
		try {
			await authClient.oauth2.consent({ accept, scope });
		} catch {
			toast.error(accept ? "Failed to authorize" : "Failed to deny");
			setSubmitting(false);
		}
	};

	if (loading) {
		return (
			<div className="mx-auto mt-20 max-w-md px-4">
				<Skeleton className="h-48 w-full" />
			</div>
		);
	}

	return (
		<div className="mx-auto mt-20 max-w-md px-4">
			<Card>
				<CardHeader>
					<div className="flex items-center gap-3">
						{clientInfo?.icon && (
							<img src={clientInfo.icon} alt="" className="size-10 rounded" />
						)}
						<div>
							<CardTitle>Authorize access</CardTitle>
							<CardDescription>
								<strong>{clientInfo?.name ?? client_id}</strong> is requesting
								access to your account.
							</CardDescription>
						</div>
					</div>
				</CardHeader>

				{scopes.length > 0 && (
					<div className="px-4 pb-4">
						<p className="mb-2 text-muted-foreground text-xs">
							This application is requesting the following permissions:
						</p>
						<ul className="space-y-1">
							{scopes.map((s) => (
								<li
									key={s}
									className="rounded bg-muted px-2 py-1 font-mono text-xs"
								>
									{s}
								</li>
							))}
						</ul>
					</div>
				)}

				<CardFooter className="gap-2">
					<Button
						onClick={() => handleConsent(false)}
						variant="outline"
						disabled={submitting}
					>
						Deny
					</Button>
					<Button onClick={() => handleConsent(true)} disabled={submitting}>
						{submitting ? "Authorizing..." : "Authorize"}
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
