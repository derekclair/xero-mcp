/**
 * Map Xero API errors to agent-readable MCP tool results.
 */

export class XeroApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public code?: string,
		public validationErrors?: unknown,
		public requiredScope?: string,
	) {
		super(message);
		this.name = "XeroApiError";
	}
}

export type ToolErrorBody = {
	error: string;
	code: string;
	xero_status?: number;
	required_scope?: string;
	validation_errors?: unknown;
	hint?: string;
};

export function toolError(err: unknown): { content: { type: "text"; text: string }[]; isError: true } {
	if (err instanceof XeroApiError) {
		const body: ToolErrorBody = {
			error: err.message,
			code: err.code ?? "xero_api_error",
			xero_status: err.status,
		};
		if (err.requiredScope) body.required_scope = err.requiredScope;
		if (err.validationErrors) body.validation_errors = err.validationErrors;
		if (err.status === 401 || err.status === 403) {
			body.hint =
				"Re-authenticate with the required Xero scopes, or check the connected user's organisation role.";
		}
		return {
			content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
			isError: true,
		};
	}

	const message = err instanceof Error ? err.message : String(err);
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify({ error: message, code: "internal_error" }, null, 2),
			},
		],
		isError: true,
	};
}

export function toolOk(data: unknown): { content: { type: "text"; text: string }[] } {
	const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
	return { content: [{ type: "text", text }] };
}

/**
 * Parse Xero error JSON body when available.
 */
export async function parseXeroErrorResponse(
	status: number,
	response: Response,
): Promise<XeroApiError> {
	let body: unknown;
	const text = await response.text();
	try {
		body = JSON.parse(text);
	} catch {
		body = text;
	}

	const record = body as Record<string, unknown> | string;
	let message = `Xero API error (${status})`;
	let code = "xero_http_error";
	let validationErrors: unknown;

	if (typeof record === "object" && record) {
		if (typeof record.Detail === "string") message = record.Detail;
		else if (typeof record.Message === "string") message = record.Message;
		else if (typeof record.title === "string") message = record.title;
		if (typeof record.Type === "string") code = record.Type;
		if (record.Elements) validationErrors = record.Elements;
		// insufficient_scope style
		if (status === 401 || status === 403) {
			code = "insufficient_scope_or_forbidden";
		}
	} else if (typeof record === "string" && record) {
		message = record.slice(0, 500);
	}

	return new XeroApiError(message, status, code, validationErrors);
}
