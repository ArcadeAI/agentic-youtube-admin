/**
 * In-memory store for pending OAuth redirect destinations.
 * When an Arcade tool auth flow is initiated, we store where the user
 * should be redirected after the verifier completes.
 * Keyed by arcadeUserId (email). Entries auto-expire after 10 minutes.
 */
const store = new Map<string, { path: string; expiresAt: number }>();

const TTL_MS = 10 * 60 * 1000;

export function setPendingRedirect(arcadeUserId: string, path: string): void {
	store.set(arcadeUserId, { path, expiresAt: Date.now() + TTL_MS });
}

export function consumePendingRedirect(arcadeUserId: string): string | null {
	const entry = store.get(arcadeUserId);
	if (!entry) return null;
	store.delete(arcadeUserId);
	if (Date.now() > entry.expiresAt) return null;
	return entry.path;
}
