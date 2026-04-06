function timestamp(): string {
	return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function formatBackfillComplete(
	result: {
		completed: boolean;
		retentionPointsTotal: number;
		liveTimelinePointsTotal: number;
	},
	channelTitle?: string,
): string {
	const channel = channelTitle ? `\nChannel: ${channelTitle}` : "";
	return [
		"*Backfill Complete*",
		channel,
		`- Retention data points: ${result.retentionPointsTotal}`,
		`- Live timeline points: ${result.liveTimelinePointsTotal}`,
		`Completed at ${timestamp()} UTC`,
	]
		.filter(Boolean)
		.join("\n");
}

export function formatDailySyncComplete(
	result: { completed: boolean; totalUpserted: number },
	channelTitle?: string,
): string {
	const channel = channelTitle ? `\nChannel: ${channelTitle}` : "";
	return [
		"*Daily Sync Complete*",
		channel,
		`- ${result.totalUpserted} data points synced`,
		`Completed at ${timestamp()} UTC`,
	]
		.filter(Boolean)
		.join("\n");
}

export function formatTrackedPollComplete(result: {
	channelsPolled: number;
	channelsScored: number;
	channelsFailed: number;
	errors: string[];
}): string {
	const lines = [
		"*Tracked Channel Poll Complete*",
		`- Channels polled: ${result.channelsPolled}`,
		`- Channels scored: ${result.channelsScored}`,
	];
	if (result.channelsFailed > 0) {
		lines.push(`- Channels failed: ${result.channelsFailed}`);
	}
	if (result.errors.length > 0) {
		lines.push(`- Errors: ${result.errors.slice(0, 3).join(", ")}`);
	}
	lines.push(`Completed at ${timestamp()} UTC`);
	return lines.join("\n");
}

export function formatTranscriptionComplete(
	result: {
		ownedTranscribed: number;
		trackedTranscribed: number;
		errors: string[];
	},
	channelTitle?: string,
): string {
	const channel = channelTitle ? `\nChannel: ${channelTitle}` : "";
	const lines = [
		"*Transcription Complete*",
		channel,
		`- Owned videos transcribed: ${result.ownedTranscribed}`,
		`- Tracked videos transcribed: ${result.trackedTranscribed}`,
	];
	if (result.errors.length > 0) {
		lines.push(`- Errors: ${result.errors.slice(0, 3).join(", ")}`);
	}
	lines.push(`Completed at ${timestamp()} UTC`);
	return lines.filter(Boolean).join("\n");
}

export function formatScanError(
	scanType: string,
	errorMessage: string,
	channelTitle?: string,
): string {
	const channel = channelTitle ? `\nChannel: ${channelTitle}` : "";
	const typeLabel = scanType.replace(/_/g, " ");
	return [
		`*Scan Failed: ${typeLabel}*`,
		channel,
		`Error: ${errorMessage}`,
		`Failed at ${timestamp()} UTC`,
	]
		.filter(Boolean)
		.join("\n");
}
