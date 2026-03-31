import { env } from "@agentic-youtube-admin/env/server";
import Arcade from "@arcadeai/arcadejs";

let _client: Arcade | null = null;

export function getArcadeClient(): Arcade {
	if (!_client) {
		_client = new Arcade({
			apiKey: env.ARCADE_API_KEY,
		});
	}
	return _client;
}
