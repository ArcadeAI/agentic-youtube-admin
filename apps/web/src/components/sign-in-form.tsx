import { Button } from "@agentic-youtube-admin/ui/components/button";
import { Input } from "@agentic-youtube-admin/ui/components/input";
import { Label } from "@agentic-youtube-admin/ui/components/label";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignInForm() {
	const { isPending } = authClient.useSession();
	const [email, setEmail] = useState("");
	const [magicLinkSent, setMagicLinkSent] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	if (isPending) {
		return <Loader />;
	}

	const handleMagicLink = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email) {
			toast.error("Please enter your email");
			return;
		}

		setIsSubmitting(true);
		try {
			await authClient.signIn.magicLink({
				email,
				callbackURL: "/dashboard",
			});
			setMagicLinkSent(true);
			toast.success("Magic link sent! Check your email.");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to send magic link",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handlePasskey = async () => {
		setIsSubmitting(true);
		try {
			await authClient.signIn.passkey();
			toast.success("Signed in with passkey");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Passkey sign-in failed",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	if (magicLinkSent) {
		return (
			<div className="mx-auto mt-10 w-full max-w-md p-6 text-center">
				<h1 className="mb-4 font-bold text-3xl">Check your email</h1>
				<p className="mb-6 text-muted-foreground">
					We sent a sign-in link to <strong>{email}</strong>
				</p>
				<Button
					variant="link"
					onClick={() => setMagicLinkSent(false)}
					className="text-indigo-600 hover:text-indigo-800"
				>
					Use a different email
				</Button>
			</div>
		);
	}

	return (
		<div className="mx-auto mt-10 w-full max-w-md p-6">
			<h1 className="mb-6 text-center font-bold text-3xl">Sign In</h1>

			<form onSubmit={handleMagicLink} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="email">Email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						placeholder="you@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						autoComplete="email webauthn"
					/>
				</div>

				<Button
					type="submit"
					className="w-full"
					disabled={isSubmitting || !email}
				>
					{isSubmitting ? "Sending..." : "Send magic link"}
				</Button>
			</form>

			<div className="my-6 flex items-center gap-4">
				<div className="h-px flex-1 bg-border" />
				<span className="text-muted-foreground text-sm">or</span>
				<div className="h-px flex-1 bg-border" />
			</div>

			<Button
				variant="outline"
				className="w-full"
				onClick={handlePasskey}
				disabled={isSubmitting}
			>
				Sign in with passkey
			</Button>
		</div>
	);
}
