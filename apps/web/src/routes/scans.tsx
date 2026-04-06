import { Button } from "@agentic-youtube-admin/ui/components/button";
import {
	Card,
	CardContent,
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

import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

const SCAN_TYPES = [
	{ value: "owned_backfill", label: "Owned channel backfill" },
	{ value: "owned_daily_sync", label: "Owned channel daily sync" },
	{ value: "tracked_daily_poll", label: "Tracked channel daily poll" },
] as const;

const CRON_PRESETS = [
	{ label: "Every day at 3 AM", value: "0 3 * * *" },
	{ label: "Every 6 hours", value: "0 */6 * * *" },
	{ label: "Every 12 hours", value: "0 */12 * * *" },
	{ label: "Every Monday at 6 AM", value: "0 6 * * 1" },
	{ label: "Every hour", value: "0 * * * *" },
	{ label: "Custom...", value: "custom" },
] as const;

function scanTypeLabel(value: string) {
	return SCAN_TYPES.find((t) => t.value === value)?.label ?? value;
}

function needsChannel(scanType: string) {
	return scanType === "owned_backfill" || scanType === "owned_daily_sync";
}

export const Route = createFileRoute("/scans")({
	component: ScansPage,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			redirect({ to: "/login", throw: true });
		}
		return { session };
	},
});

interface Channel {
	id: string;
	channelId: string;
	channelTitle: string;
}

interface Schedule {
	id: string;
	scanType: string;
	channelId: string | null;
	cronExpression: string;
	isActive: boolean;
	lastRunAt: Date | null;
	lastRunStatus: string | null;
	lastRunError: string | null;
	createdAt: Date;
}

function ScansPage() {
	const { session } = Route.useRouteContext();
	const userId = session.data?.user.id ?? "";

	// Channels for picker
	const [channels, setChannels] = useState<Channel[]>([]);
	const [channelsLoading, setChannelsLoading] = useState(true);

	// Run scan state
	const [scanType, setScanType] = useState("owned_daily_sync");
	const [selectedChannel, setSelectedChannel] = useState("");
	const [startDate, setStartDate] = useState(() => {
		const d = new Date();
		d.setFullYear(d.getFullYear() - 2);
		return d.toISOString().split("T")[0] as string;
	});
	const [endDate, setEndDate] = useState(() => {
		const d = new Date();
		d.setDate(d.getDate() - 1);
		return d.toISOString().split("T")[0] as string;
	});
	const [running, setRunning] = useState(false);

	// Schedules state
	const [schedules, setSchedules] = useState<Schedule[]>([]);
	const [schedulesLoading, setSchedulesLoading] = useState(true);
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [newScanType, setNewScanType] = useState("owned_daily_sync");
	const [newChannelId, setNewChannelId] = useState("");
	const [cronPreset, setCronPreset] = useState("0 3 * * *");
	const [customCron, setCustomCron] = useState("");
	const [creating, setCreating] = useState(false);

	const fetchChannels = useCallback(async () => {
		try {
			const { data } = await api.api.youtube.channels.get({
				query: { userId },
			});
			setChannels((data as Channel[]) ?? []);
		} catch {
			// Channels may not be connected yet
		} finally {
			setChannelsLoading(false);
		}
	}, [userId]);

	const fetchSchedules = useCallback(async () => {
		try {
			const { data } = await api.api.scheduler.schedules.get({
				query: { userId },
			});
			setSchedules((data as unknown as Schedule[]) ?? []);
		} catch {
			toast.error("Failed to load schedules");
		} finally {
			setSchedulesLoading(false);
		}
	}, [userId]);

	useEffect(() => {
		fetchChannels();
		fetchSchedules();
	}, [fetchChannels, fetchSchedules]);

	// Auto-select first channel when loaded
	useEffect(() => {
		if (channels.length > 0 && !selectedChannel) {
			setSelectedChannel(channels[0].id);
		}
		if (channels.length > 0 && !newChannelId) {
			setNewChannelId(channels[0].id);
		}
	}, [channels, selectedChannel, newChannelId]);

	const channelName = (id: string | null) =>
		channels.find((c) => c.id === id)?.channelTitle ?? id ?? "—";

	// ── Run Scan Now ──────────────────────────────────────────────────────────

	const handleRunScan = async () => {
		if (needsChannel(scanType) && !selectedChannel) {
			toast.error("Select a channel first");
			return;
		}
		setRunning(true);
		try {
			switch (scanType) {
				case "owned_backfill":
					await (
						api.api.scanner.backfill.post as (body: unknown) => Promise<unknown>
					)({
						userId,
						channelId: selectedChannel,
						startDate,
						endDate,
					});
					break;
				case "owned_daily_sync":
					await (
						api.api.scanner["daily-sync"].post as (
							body: unknown,
						) => Promise<unknown>
					)({
						userId,
						channelId: selectedChannel,
					});
					break;
				case "tracked_daily_poll":
					await (
						api.api.scanner["daily-poll"].post as (
							body: unknown,
						) => Promise<unknown>
					)({ userId });
					break;
			}
			toast.success(`${scanTypeLabel(scanType)} completed`);
		} catch {
			toast.error(`${scanTypeLabel(scanType)} failed`);
		} finally {
			setRunning(false);
		}
	};

	// ── Schedule CRUD ─────────────────────────────────────────────────────────

	const handleCreateSchedule = async () => {
		const cron = cronPreset === "custom" ? customCron : cronPreset;
		if (!cron.trim()) {
			toast.error("Enter a cron expression");
			return;
		}
		if (needsChannel(newScanType) && !newChannelId) {
			toast.error("Select a channel");
			return;
		}
		setCreating(true);
		try {
			await (
				api.api.scheduler.schedules.post as (body: unknown) => Promise<unknown>
			)({
				userId,
				scanType: newScanType,
				channelId: needsChannel(newScanType) ? newChannelId : undefined,
				cronExpression: cron,
			});
			toast.success("Schedule created");
			setShowCreateForm(false);
			await fetchSchedules();
		} catch {
			toast.error("Failed to create schedule");
		} finally {
			setCreating(false);
		}
	};

	const handleToggleActive = async (schedule: Schedule) => {
		try {
			await (
				api.api.scheduler.schedules({ id: schedule.id }).patch as (
					body: unknown,
				) => Promise<unknown>
			)({
				userId,
				isActive: !schedule.isActive,
			});
			toast.success(
				schedule.isActive ? "Schedule paused" : "Schedule activated",
			);
			await fetchSchedules();
		} catch {
			toast.error("Failed to update schedule");
		}
	};

	const handleDeleteSchedule = async (id: string) => {
		try {
			await api.api.scheduler.schedules({ id }).delete(null as never, {
				query: { userId },
			});
			toast.success("Schedule deleted");
			await fetchSchedules();
		} catch {
			toast.error("Failed to delete schedule");
		}
	};

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
			<h1 className="font-bold text-2xl">Scans</h1>

			{/* Run Scan Now */}
			<Card>
				<CardHeader>
					<CardTitle>Run Scan Now</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						<div className="space-y-1">
							<Label htmlFor="scan-type">Scan type</Label>
							<select
								id="scan-type"
								value={scanType}
								onChange={(e) => setScanType(e.target.value)}
								className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm"
							>
								{SCAN_TYPES.map((t) => (
									<option key={t.value} value={t.value}>
										{t.label}
									</option>
								))}
							</select>
						</div>

						{needsChannel(scanType) && (
							<div className="space-y-1">
								<Label htmlFor="channel">Channel</Label>
								{channelsLoading ? (
									<Skeleton className="h-9 w-full" />
								) : channels.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										No channels connected. Connect one from the Dashboard first.
									</p>
								) : (
									<select
										id="channel"
										value={selectedChannel}
										onChange={(e) => setSelectedChannel(e.target.value)}
										className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm"
									>
										{channels.map((c) => (
											<option key={c.id} value={c.id}>
												{c.channelTitle}
											</option>
										))}
									</select>
								)}
							</div>
						)}

						{scanType === "owned_backfill" && (
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1">
									<Label htmlFor="start-date">Start date</Label>
									<Input
										id="start-date"
										type="date"
										value={startDate}
										onChange={(e) => setStartDate(e.target.value)}
									/>
								</div>
								<div className="space-y-1">
									<Label htmlFor="end-date">End date</Label>
									<Input
										id="end-date"
										type="date"
										value={endDate}
										onChange={(e) => setEndDate(e.target.value)}
									/>
								</div>
							</div>
						)}
					</div>
				</CardContent>
				<CardFooter>
					<Button
						onClick={handleRunScan}
						disabled={running || (needsChannel(scanType) && !selectedChannel)}
					>
						{running ? "Running..." : "Run Now"}
					</Button>
				</CardFooter>
			</Card>

			{/* Scheduled Scans */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<h2 className="font-semibold text-lg">Scheduled Scans</h2>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowCreateForm(!showCreateForm)}
					>
						{showCreateForm ? "Cancel" : "New Schedule"}
					</Button>
				</div>

				{showCreateForm && (
					<Card>
						<CardHeader>
							<CardTitle>New Schedule</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								<div className="space-y-1">
									<Label htmlFor="new-scan-type">Scan type</Label>
									<select
										id="new-scan-type"
										value={newScanType}
										onChange={(e) => setNewScanType(e.target.value)}
										className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm"
									>
										{SCAN_TYPES.map((t) => (
											<option key={t.value} value={t.value}>
												{t.label}
											</option>
										))}
									</select>
								</div>

								{needsChannel(newScanType) && (
									<div className="space-y-1">
										<Label htmlFor="new-channel">Channel</Label>
										{channelsLoading ? (
											<Skeleton className="h-9 w-full" />
										) : channels.length === 0 ? (
											<p className="text-muted-foreground text-sm">
												No channels connected.
											</p>
										) : (
											<select
												id="new-channel"
												value={newChannelId}
												onChange={(e) => setNewChannelId(e.target.value)}
												className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm"
											>
												{channels.map((c) => (
													<option key={c.id} value={c.id}>
														{c.channelTitle}
													</option>
												))}
											</select>
										)}
									</div>
								)}

								<div className="space-y-1">
									<Label htmlFor="cron-preset">Frequency</Label>
									<select
										id="cron-preset"
										value={cronPreset}
										onChange={(e) => setCronPreset(e.target.value)}
										className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm"
									>
										{CRON_PRESETS.map((p) => (
											<option key={p.value} value={p.value}>
												{p.label}
											</option>
										))}
									</select>
								</div>

								{cronPreset === "custom" && (
									<div className="space-y-1">
										<Label htmlFor="custom-cron">Cron expression</Label>
										<Input
											id="custom-cron"
											placeholder="0 */6 * * *"
											value={customCron}
											onChange={(e) => setCustomCron(e.target.value)}
										/>
									</div>
								)}
							</div>
						</CardContent>
						<CardFooter>
							<Button onClick={handleCreateSchedule} disabled={creating}>
								{creating ? "Creating..." : "Create Schedule"}
							</Button>
						</CardFooter>
					</Card>
				)}

				{schedulesLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-20 w-full" />
						<Skeleton className="h-20 w-full" />
					</div>
				) : schedules.length === 0 ? (
					<Card>
						<CardContent className="py-6 text-center text-muted-foreground text-sm">
							No scheduled scans yet. Create one to automate your scans.
						</CardContent>
					</Card>
				) : (
					schedules.map((schedule) => (
						<Card key={schedule.id} size="sm">
							<CardContent className="flex items-center justify-between py-3">
								<div className="space-y-1">
									<div className="flex items-center gap-2">
										<span className="font-medium text-sm">
											{scanTypeLabel(schedule.scanType)}
										</span>
										{schedule.channelId && (
											<span className="text-muted-foreground text-xs">
												— {channelName(schedule.channelId)}
											</span>
										)}
										<span
											className={`rounded-full px-2 py-0.5 text-xs ${
												schedule.isActive
													? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
													: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
											}`}
										>
											{schedule.isActive ? "Active" : "Paused"}
										</span>
									</div>
									<div className="flex gap-3 text-muted-foreground text-xs">
										<span>Cron: {schedule.cronExpression}</span>
										{schedule.lastRunAt && (
											<span>
												Last run:{" "}
												{new Date(schedule.lastRunAt).toLocaleString()}
												{schedule.lastRunStatus && (
													<> ({schedule.lastRunStatus})</>
												)}
											</span>
										)}
									</div>
								</div>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="xs"
										onClick={() => handleToggleActive(schedule)}
									>
										{schedule.isActive ? "Pause" : "Activate"}
									</Button>
									<Button
										variant="destructive"
										size="xs"
										onClick={() => handleDeleteSchedule(schedule.id)}
									>
										Delete
									</Button>
								</div>
							</CardContent>
						</Card>
					))
				)}
			</div>
		</div>
	);
}
