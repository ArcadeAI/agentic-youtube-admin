export class ArcadeError extends Error {
	constructor(
		message: string,
		public readonly toolName?: string,
	) {
		super(message);
		this.name = "ArcadeError";
	}
}

export class AuthRequiredError extends ArcadeError {
	constructor(
		public readonly authUrl: string,
		toolName?: string,
	) {
		super("User authorization required", toolName);
		this.name = "AuthRequiredError";
	}
}

export class QuotaExceededError extends ArcadeError {
	constructor(toolName?: string) {
		super("YouTube API quota exceeded", toolName);
		this.name = "QuotaExceededError";
	}
}

export class ToolExecutionError extends ArcadeError {
	constructor(
		message: string,
		toolName?: string,
		public readonly code?: string,
	) {
		super(message, toolName);
		this.name = "ToolExecutionError";
	}
}

export class ToolValidationError extends ArcadeError {
	constructor(
		message: string,
		toolName?: string,
		public readonly rawResponse?: unknown,
	) {
		super(message, toolName);
		this.name = "ToolValidationError";
	}
}
