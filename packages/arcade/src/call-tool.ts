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

/**
 * Authorize and execute a tool. The correct Arcade pattern:
 * 1. Call tools.authorize() to check/start auth
 * 2. If auth is pending, return the URL so the caller can redirect the user
 * 3. Call auth.waitForCompletion() to block until the user completes OAuth
 * 4. Call tools.execute() — guaranteed to succeed (auth-wise)
 */
export async function callTool<T>(
	toolName: string,
	userId: string,
	inputs: Record<string, unknown>,
	schema: z.ZodType<T>,
): Promise<ArcadeResult<T>> {
	const client = getArcadeClient();

	// Step 1: Authorize
	const authResponse = await client.tools.authorize({
		tool_name: toolName,
		user_id: userId,
	});

	// Step 2: If auth is pending, wait for the user to complete it
	if (authResponse.status !== "completed") {
		if (!authResponse.id) {
			const authUrl = authResponse.url ?? "unknown";
			return { ok: false, error: new AuthRequiredError(authUrl, toolName) };
		}
		await client.auth.waitForCompletion(authResponse.id);
	}

	// Step 3: Execute — auth is guaranteed complete
	const response = await client.tools.execute({
		tool_name: toolName,
		user_id: userId,
		input: inputs,
	});

	return parseToolResponse(response, toolName, schema);
}

/**
 * Check if a tool requires auth without waiting.
 * Returns the auth URL if the user needs to authorize, or null if already authorized.
 */
export async function checkToolAuth(
	toolName: string,
	userId: string,
): Promise<
	{ needsAuth: false } | { needsAuth: true; authUrl: string; authId: string }
> {
	const client = getArcadeClient();

	const authResponse = await client.tools.authorize({
		tool_name: toolName,
		user_id: userId,
	});

	if (authResponse.status === "completed") {
		return { needsAuth: false };
	}

	return {
		needsAuth: true,
		authUrl: authResponse.url ?? "unknown",
		authId: authResponse.id ?? "",
	};
}

/**
 * Wait for a pending auth to complete, then execute the tool.
 * Use after the user has been redirected to the auth URL and returned.
 */
export async function waitAndExecuteTool<T>(
	authId: string,
	toolName: string,
	userId: string,
	inputs: Record<string, unknown>,
	schema: z.ZodType<T>,
): Promise<ArcadeResult<T>> {
	const client = getArcadeClient();

	await client.auth.waitForCompletion(authId);

	const response = await client.tools.execute({
		tool_name: toolName,
		user_id: userId,
		input: inputs,
	});

	return parseToolResponse(response, toolName, schema);
}

function parseToolResponse<T>(
	response: {
		output?: { error?: { message: string; kind?: string }; value?: unknown };
	},
	toolName: string,
	schema: z.ZodType<T>,
): ArcadeResult<T> {
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
