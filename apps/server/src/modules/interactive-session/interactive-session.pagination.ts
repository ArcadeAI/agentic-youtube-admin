export interface PaginatedResponse<T> {
	items: T[];
	nextPageToken: string | null;
	totalCount?: number;
}

interface CursorPayload {
	cursor: string;
	limit: number;
}

export function encodePageToken(cursor: string, limit: number): string {
	const payload: CursorPayload = { cursor, limit };
	return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodePageToken(token: string): CursorPayload | null {
	try {
		const json = Buffer.from(token, "base64url").toString("utf-8");
		return JSON.parse(json) as CursorPayload;
	} catch {
		return null;
	}
}

export function paginateResults<T extends { id: string }>(
	items: T[],
	limit: number,
): PaginatedResponse<T> {
	const hasMore = items.length > limit;
	const page = hasMore ? items.slice(0, limit) : items;
	const lastItem = page[page.length - 1];
	const nextPageToken =
		hasMore && lastItem ? encodePageToken(lastItem.id, limit) : null;

	return {
		items: page,
		nextPageToken,
	};
}
