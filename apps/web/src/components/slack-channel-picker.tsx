import { Input } from "@agentic-youtube-admin/ui/components/input";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";

interface SlackChannel {
	id: string;
	name: string;
	isPrivate: boolean;
}

export type SlackDestination =
	| { type: "channel"; channelName: string }
	| { type: "dm" };

interface SlackChannelPickerProps {
	value: SlackDestination | null;
	onChange: (dest: SlackDestination) => void;
	disabled?: boolean;
}

export function SlackChannelPicker({
	value,
	onChange,
	disabled,
}: SlackChannelPickerProps) {
	const [channels, setChannels] = useState<SlackChannel[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState("");
	const [open, setOpen] = useState(false);

	const fetchChannels = useCallback(async () => {
		try {
			const { data } = await api.api.slack.channels.get();
			if (data && typeof data === "object" && "channels" in data) {
				setChannels(data.channels as SlackChannel[]);
			}
		} catch {
			// Channel list failed — user may need to connect Slack first
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchChannels();
	}, [fetchChannels]);

	const filtered = useMemo(() => {
		if (!filter) return channels;
		const lower = filter.toLowerCase();
		return channels.filter((c) => c.name?.toLowerCase().includes(lower));
	}, [channels, filter]);

	const selectedLabel =
		value === null
			? "Select destination..."
			: value.type === "dm"
				? "Direct message to me"
				: `#${value.channelName}`;

	if (loading) {
		return (
			<div className="text-muted-foreground text-sm">
				Loading Slack channels...
			</div>
		);
	}

	return (
		<div className="relative">
			<button
				type="button"
				className="flex h-9 w-full items-center justify-between border border-input bg-background px-3 py-2 text-left text-sm disabled:opacity-50"
				onClick={() => !disabled && setOpen(!open)}
				disabled={disabled}
			>
				<span className={value === null ? "text-muted-foreground" : ""}>
					{selectedLabel}
				</span>
				<span className="text-muted-foreground text-xs">
					{open ? "\u25B2" : "\u25BC"}
				</span>
			</button>

			{open && (
				<div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto border border-input bg-background shadow-md">
					<div className="sticky top-0 border-b p-1">
						<Input
							placeholder="Search channels..."
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
							className="h-7 text-xs"
							autoFocus
						/>
					</div>

					<button
						type="button"
						className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
						onClick={() => {
							onChange({ type: "dm" });
							setOpen(false);
							setFilter("");
						}}
					>
						Direct message to me
					</button>

					{filtered.map((ch) => (
						<button
							key={ch.id}
							type="button"
							className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
							onClick={() => {
								onChange({ type: "channel", channelName: ch.name });
								setOpen(false);
								setFilter("");
							}}
						>
							{ch.isPrivate ? "\uD83D\uDD12 " : "#"}
							{ch.name}
						</button>
					))}

					{filtered.length === 0 && (
						<div className="px-3 py-2 text-muted-foreground text-sm">
							No channels found
						</div>
					)}
				</div>
			)}
		</div>
	);
}
