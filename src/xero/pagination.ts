/**
 * Helpers for Xero list endpoints (page, where, order).
 */

export type ListQuery = {
	page?: number;
	pageSize?: number;
	where?: string;
	order?: string;
	includeArchived?: boolean;
	ids?: string;
	unitdp?: number;
	ifModifiedSince?: string;
};

export function buildQuery(params: ListQuery): Record<string, string> {
	const q: Record<string, string> = {};
	if (params.page != null) q.page = String(params.page);
	// pageSize supported on some newer endpoints; harmless if ignored
	if (params.pageSize != null) q.pageSize = String(Math.min(params.pageSize, 100));
	if (params.where) q.where = params.where;
	if (params.order) q.order = params.order;
	if (params.includeArchived) q.includeArchived = "true";
	if (params.ids) q.IDs = params.ids;
	if (params.unitdp != null) q.unitdp = String(params.unitdp);
	return q;
}

/** Cap list payloads returned to the model */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_SUMMARY_ITEMS = 50;

export function summariseList<T>(
	items: T[],
	opts?: { max?: number; totalHint?: string },
): { items: T[]; truncated: boolean; count: number; note?: string } {
	const max = opts?.max ?? MAX_SUMMARY_ITEMS;
	const truncated = items.length > max;
	return {
		items: items.slice(0, max),
		truncated,
		count: items.length,
		note: truncated
			? `Showing first ${max} of ${items.length} items. Use page/where filters to narrow results.`
			: opts?.totalHint,
	};
}
