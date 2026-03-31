import type { z } from "zod";
import { getArcadeClient } from "./client";
import {
	AuthRequiredError,
	QuotaExceededError,
	ToolExecutionError,
	ToolValidationError,
} from "./errors";

export type ArcadeResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: ArcadeToolError };

export type ArcadeToolError =
	| AuthRequiredError
	| QuotaExceededError
	| ToolExecutionError
	| ToolValidationError;

export async function callTool<T>(
	toolName: string,
	userId: string,
	inputs: Record<string, unknown>,
	schema: z.ZodType<T>,
): Promise<ArcadeResult<T>> {
	const client = getArcadeClient();

	const response = await client.tools.execute({
		tool_name: toolName,
		user_id: userId,
		input: inputs,
	});

	if (
		response.output?.authorization &&
		response.output.authorization.status !== "completed"
	) {
		const authUrl = response.output.authorization.url ?? "unknown";
		return { ok: false, error: new AuthRequiredError(authUrl, toolName) };
	}

	if (response.output?.error) {
		const err = response.output.error;
		if (err.kind === "UPSTREAM_RUNTIME_RATE_LIMIT") {
			return { ok: false, error: new QuotaExceededError(toolName) };
		}
		return {
			ok: false,
			error: new ToolExecutionError(err.message, toolName, err.kind),
		};
	}

	const rawValue = response.output?.value;
	let parsed: unknown;
	if (typeof rawValue === "string") {
		try {
			parsed = JSON.parse(rawValue);
		} catch {
			parsed = rawValue;
		}
	} else {
		parsed = rawValue;
	}

	const result = schema.safeParse(parsed);
	if (!result.success) {
		return {
			ok: false,
			error: new ToolValidationError(
				`Response validation failed: ${result.error.message}`,
				toolName,
				parsed,
			),
		};
	}

	return { ok: true, data: result.data };
}
